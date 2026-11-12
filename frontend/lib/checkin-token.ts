import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof of presence for venue check-ins (ported from Brand Engage Pro).
 *
 * The venue QR carries `?t=<token>`, an HMAC-SHA256 keyed with
 * CHECKIN_TOKEN_SECRET over `checkin:${artistSlug}:${bucket}` where
 * bucket = floor(unixSeconds / ROTATION_SECONDS). The token therefore
 * changes every 15 minutes, so one photo of the QR cannot earn points from
 * home every day. Verification accepts the current bucket and the one
 * before it (grace window), so a scan right at a boundary still works.
 *
 * Rotation is ON only when BOTH hold:
 *   - CHECKIN_TOKEN_SECRET is set (hex from `openssl rand -hex 32`), and
 *   - CHECKIN_TOKEN_ROTATION is not exactly "off".
 *
 * Otherwise rotation is OFF — the legacy static URL
 * /artists/<slug>/checkin keeps working and any token is ignored. That is
 * the default on Fan Engage today: the env vars are not yet set on the
 * Vercel project, so this ships as a no-op until they are. The API route
 * logs one warning per process when it allows an unverified check-in.
 *
 * Server only: this module uses node:crypto.
 */

/** Query parameter that carries the token on the check-in URL. */
export const CHECKIN_TOKEN_PARAM = "t";

/** How long one token stays current (seconds). 15 minutes. */
export const ROTATION_SECONDS = 900;

/**
 * How far back (in buckets) a stale token is still recognised as "expired"
 * rather than "invalid" — 24 hours. Older than that, or never valid, and
 * the fan just gets the generic "scan the QR" message.
 */
export const EXPIRED_LOOKBACK_BUCKETS = (24 * 60 * 60) / ROTATION_SECONDS;

/** Shown when the token is missing or wrong. */
export const CHECKIN_TOKEN_REQUIRED_MESSAGE =
  "Scan the QR code at the venue to check in.";

/** Machine-readable error code for a token that was valid but has rotated out. */
export const CHECKIN_TOKEN_EXPIRED_CODE = "expired_code";

/** Shown when the token has rotated out. */
export const CHECKIN_TOKEN_EXPIRED_MESSAGE =
  "This code has expired — scan the live QR at the merch table again.";

type Env = Record<string, string | undefined>;

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Read the signing secret. Blank or missing means "not configured". */
export function checkinSecretFromEnv(env: Env = process.env): string | null {
  const value = env.CHECKIN_TOKEN_SECRET?.trim();
  return value ? value : null;
}

/**
 * Rotation is on only when a secret is configured and
 * CHECKIN_TOKEN_ROTATION is not exactly "off" (case-insensitive, trimmed).
 * An unset secret therefore means rotation off (legacy static URL).
 */
export function checkinRotationEnabled(env: Env = process.env): boolean {
  if (!checkinSecretFromEnv(env)) return false;
  return (env.CHECKIN_TOKEN_ROTATION ?? "").trim().toLowerCase() !== "off";
}

/** Rotation bucket for a point in time (ms since epoch). */
export function checkinTokenBucket(now: number = Date.now()): number {
  return Math.floor(now / 1000 / ROTATION_SECONDS);
}

/**
 * When the token minted at `now` stops being the *current* one (ms since
 * epoch) — i.e. when the portal QR should refresh. Verification keeps
 * accepting it for one more bucket after this (the grace window).
 */
export function checkinTokenExpiresAt(now: number = Date.now()): number {
  return (checkinTokenBucket(now) + 1) * ROTATION_SECONDS * 1000;
}

function hmac(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

function signBucket(artistSlug: string, secret: string, bucket: number): string {
  return hmac(`checkin:${normalizeSlug(artistSlug)}:${bucket}`, secret);
}

/**
 * Sign a rotating check-in token for `artistSlug` (base64url) for the
 * bucket that contains `now`. Callers decide whether rotation is on; see
 * `checkinTokenDecision` and the admin token route.
 */
export function signCheckinToken(
  artistSlug: string,
  secret: string,
  now: number = Date.now(),
): string {
  return signBucket(artistSlug, secret, checkinTokenBucket(now));
}

/** Constant-time equality of two base64url strings. */
function tokenEquals(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Constant-time check that `token` was signed for `artistSlug` in the
 * bucket containing `now` or the bucket before it (grace window). Two or
 * more buckets back, or from the future, is rejected.
 */
export function verifyCheckinToken(
  artistSlug: string,
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!token || typeof token !== "string") return false;
  const given = token.trim();
  const bucket = checkinTokenBucket(now);
  // Evaluate both so timing does not reveal which bucket matched.
  const current = tokenEquals(given, signBucket(artistSlug, secret, bucket));
  const previous = tokenEquals(given, signBucket(artistSlug, secret, bucket - 1));
  return current || previous;
}

/**
 * True when `token` was a real token for `artistSlug` that has since
 * rotated out (older than the grace window, within
 * EXPIRED_LOOKBACK_BUCKETS). Lets the API tell "scan the live code again"
 * apart from "never valid".
 */
export function isExpiredCheckinToken(
  artistSlug: string,
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!token || typeof token !== "string") return false;
  const given = token.trim();
  const bucket = checkinTokenBucket(now);
  for (let back = 2; back <= EXPIRED_LOOKBACK_BUCKETS; back++) {
    if (tokenEquals(given, signBucket(artistSlug, secret, bucket - back))) {
      return true;
    }
  }
  return false;
}

export type CheckinTokenDecision =
  | { allow: true; reason: "valid" | "rotation_off" }
  | { allow: false; reason: "missing" | "invalid" | "expired" };

/**
 * Decide whether a check-in may proceed.
 *
 * Rotation off (no secret, or CHECKIN_TOKEN_ROTATION=off): every check-in
 * is allowed and the token is ignored (reason "rotation_off"), so the
 * static printed QR keeps working and the deploy cannot break check-ins
 * before the env vars are added.
 *
 * Rotation on: the token is required. "expired" means it was genuine but
 * has rotated out; "invalid" means it never matched this artist (or any
 * recent bucket).
 */
export function checkinTokenDecision(
  artistSlug: string,
  token: string | null | undefined,
  now: number = Date.now(),
  env: Env = process.env,
): CheckinTokenDecision {
  const secret = checkinSecretFromEnv(env);
  if (!secret || !checkinRotationEnabled(env)) {
    return { allow: true, reason: "rotation_off" };
  }
  if (!token || !token.trim()) return { allow: false, reason: "missing" };
  if (verifyCheckinToken(artistSlug, token, secret, now)) {
    return { allow: true, reason: "valid" };
  }
  if (isExpiredCheckinToken(artistSlug, token, secret, now)) {
    return { allow: false, reason: "expired" };
  }
  return { allow: false, reason: "invalid" };
}

/** Relative check-in path, with the token when one is given. */
export function checkinPath(artistSlug: string, token?: string | null): string {
  const base = `/artists/${encodeURIComponent(normalizeSlug(artistSlug))}/checkin`;
  return token
    ? `${base}?${CHECKIN_TOKEN_PARAM}=${encodeURIComponent(token)}`
    : base;
}

export interface CheckinTokenMint {
  /** Relative path for the QR: signed when rotation is on, static otherwise. */
  path: string;
  token: string | null;
  /** When the token stops being current (ms epoch); null when rotation is off. */
  expiresAt: number | null;
  rotationSeconds: number;
  rotation: "on" | "off";
}

/**
 * Mint what the portal QR should display right now. With rotation off this
 * is the static path with no token, so the printed card and the live
 * screen agree.
 */
export function mintCheckinToken(
  artistSlug: string,
  now: number = Date.now(),
  env: Env = process.env,
): CheckinTokenMint {
  const secret = checkinSecretFromEnv(env);
  if (!secret || !checkinRotationEnabled(env)) {
    return {
      path: checkinPath(artistSlug),
      token: null,
      expiresAt: null,
      rotationSeconds: ROTATION_SECONDS,
      rotation: "off",
    };
  }
  const token = signCheckinToken(artistSlug, secret, now);
  return {
    path: checkinPath(artistSlug, token),
    token,
    expiresAt: checkinTokenExpiresAt(now),
    rotationSeconds: ROTATION_SECONDS,
    rotation: "on",
  };
}
