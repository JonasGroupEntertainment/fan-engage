/**
 * Premium upgrade popup timing + persistence.
 *
 * First visit waits 3–5s, then can show. "Not now" dismisses and
 * resurfaces after 8 App Router page views (navigations, not clicks).
 * Premium / comped / past_due never see it; once Premium, it stays gone.
 *
 * Guardrails so it never interrupts the welcome or staff work:
 * - Never on admin, artist portal, billing, legal or onboarding routes.
 * - Never in a new fan's first day (account age, or first seen on this
 *   device when the account date is unknown).
 * - After 3 lifetime dismissals it stops for good.
 * - At most once every 7 days after a dismissal.
 */

import { isPremium, type SubscriptionTier } from "./entitlements-core.ts";

export const PREMIUM_UPGRADE_PROMPT_STORAGE_KEY =
  "fanengage_premium_upgrade_prompt";

export const PAGE_VIEWS_TO_RESURFACE = 8;

export const FIRST_SHOW_DELAY_MS_MIN = 3000;
export const FIRST_SHOW_DELAY_MS_MAX = 5000;

/** After this many "Not now" taps the prompt never comes back. */
export const MAX_LIFETIME_DISMISSALS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimum gap between a dismissal and the next show. */
export const RESURFACE_COOLDOWN_MS = 7 * DAY_MS;

/** New fans get a quiet first day with no upgrade pitch. */
export const NEW_FAN_GRACE_MS = DAY_MS;

/**
 * Same form-heavy prefixes as the cookie banner, plus /premium so the
 * prompt never covers checkout or auth CTAs, plus staff tools, billing and
 * the legal pages (a sales pitch over the terms a fan is reading is not ok).
 */
export const PREMIUM_UPGRADE_PROMPT_HIDE_PREFIXES = [
  "/for-artists/apply",
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/auth",
  "/premium",
  "/admin",
  "/artist-portal",
  "/account/billing",
  "/terms",
  "/privacy",
  "/rewards-terms",
  "/cookie-policy",
  "/cancellation-refund",
  "/dmca",
  "/legal",
] as const;

export const COOKIE_BANNER_HIDE_PREFIXES = [
  "/for-artists/apply",
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/auth",
] as const;

export const PREMIUM_UPGRADE_PROMPT_COPY = {
  headline: "Go Premium. Unlock the good stuff ✨",
  body: "Post in the community, redeem rewards, and more. Merch drops coming soon.",
  dismiss: "Not now",
} as const;

export type PremiumUpgradePromptState = {
  /** True after the fan has dismissed at least once (start counting views). */
  dismissed: boolean;
  /** Client navigations since the last dismiss. */
  views: number;
  /** Sticky hide after we observed Premium (premium/comped/past_due). */
  premiumLocked: boolean;
  /** ISO time this device first saw a signed-in fan. Null until stamped. */
  firstSeenAt: string | null;
  /** Lifetime "Not now" count. Stops the prompt at MAX_LIFETIME_DISMISSALS. */
  dismissCount: number;
  /** ISO time of the last dismissal, for the 7-day cooldown. */
  lastDismissedAt: string | null;
};

export const EMPTY_PREMIUM_UPGRADE_PROMPT_STATE: PremiumUpgradePromptState = {
  dismissed: false,
  views: 0,
  premiumLocked: false,
  firstSeenAt: null,
  dismissCount: 0,
  lastDismissedAt: null,
};

function parseIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function parseCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function parsePremiumUpgradePromptState(
  raw: string | null | undefined,
): PremiumUpgradePromptState {
  if (!raw) return { ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const dismissed = parsed.dismissed === true;
    const dismissCount = parseCount(parsed.dismissCount);
    return {
      dismissed,
      views: parseCount(parsed.views),
      premiumLocked: parsed.premiumLocked === true,
      firstSeenAt: parseIsoOrNull(parsed.firstSeenAt),
      // Legacy state (before the cap) only knew "dismissed at least once".
      dismissCount: dismissed ? Math.max(1, dismissCount) : dismissCount,
      lastDismissedAt: parseIsoOrNull(parsed.lastDismissedAt),
    };
  } catch {
    return { ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE };
  }
}

export function serializePremiumUpgradePromptState(
  state: PremiumUpgradePromptState,
): string {
  return JSON.stringify({
    dismissed: state.dismissed,
    views: state.views,
    premiumLocked: state.premiumLocked,
    firstSeenAt: state.firstSeenAt,
    dismissCount: state.dismissCount,
    lastDismissedAt: state.lastDismissedAt,
  });
}

export function loadPremiumUpgradePromptState(
  storage: StorageLike,
): PremiumUpgradePromptState {
  try {
    return parsePremiumUpgradePromptState(
      storage.getItem(PREMIUM_UPGRADE_PROMPT_STORAGE_KEY),
    );
  } catch {
    return { ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE };
  }
}

export function savePremiumUpgradePromptState(
  storage: StorageLike,
  state: PremiumUpgradePromptState,
): void {
  try {
    storage.setItem(
      PREMIUM_UPGRADE_PROMPT_STORAGE_KEY,
      serializePremiumUpgradePromptState(state),
    );
  } catch {
    /* private mode / quota — prompt may reappear next visit */
  }
}

export function isPremiumUpgradePromptHiddenPath(pathname: string): boolean {
  return PREMIUM_UPGRADE_PROMPT_HIDE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

/**
 * Cookie banner is visible when no consent value is stored and the route
 * does not suppress the banner. Any stored value counts as resolved —
 * the banner hides as soon as localStorage is non-null.
 */
export function isCookieBannerOpen(opts: {
  consentRaw: string | null | undefined;
  pathname: string;
}): boolean {
  if (opts.consentRaw != null) return false;
  return !COOKIE_BANNER_HIDE_PREFIXES.some((prefix) =>
    opts.pathname.startsWith(prefix),
  );
}

/**
 * True when the viewer has Premium-level access. Accepts the shared
 * isPremium signals (tier string, membership row, or boolean).
 */
export function shouldHidePremiumUpgradeForEntitlement(
  source:
    | boolean
    | SubscriptionTier
    | string
    | null
    | undefined
    | { isPremium?: boolean; tier?: string | null; subscription_tier?: string | null },
): boolean {
  if (typeof source === "boolean") return source;
  return isPremium(source);
}

/**
 * True during a new fan's first day. Uses the account creation time when
 * the server knows it, otherwise when this device first saw the fan. With
 * neither, the fan is treated as brand new (the component stamps
 * firstSeenAt on first render, so this only holds for that first session).
 */
export function isInNewFanGrace(args: {
  now: number;
  accountCreatedAt?: string | null;
  firstSeenAt: string | null;
}): boolean {
  const start =
    parseIsoOrNull(args.accountCreatedAt) ?? parseIsoOrNull(args.firstSeenAt);
  if (start == null) return true;
  return args.now - Date.parse(start) < NEW_FAN_GRACE_MS;
}

/** True when a dismissed prompt is allowed to come back. */
export function canResurfacePremiumUpgradePrompt(
  state: PremiumUpgradePromptState,
  now: number,
): boolean {
  if (state.dismissCount >= MAX_LIFETIME_DISMISSALS) return false;
  if (state.views < PAGE_VIEWS_TO_RESURFACE) return false;
  const last = parseIsoOrNull(state.lastDismissedAt);
  // Legacy dismissals have no timestamp; the view count alone gates them.
  if (last == null) return true;
  return now - Date.parse(last) >= RESURFACE_COOLDOWN_MS;
}

export function shouldShowPremiumUpgradePrompt(args: {
  /** Signed-in Free members only. Guests never see the prompt. */
  signedIn: boolean;
  isPremium: boolean;
  state: PremiumUpgradePromptState;
  pathname: string;
  /** True while the cookie consent banner is still on screen. */
  cookieBannerOpen?: boolean;
  /** Current time in ms. Defaults to Date.now(). */
  now?: number;
  /** Supabase auth created_at for the signed-in fan, when known. */
  accountCreatedAt?: string | null;
}): boolean {
  if (!args.signedIn) return false;
  if (args.cookieBannerOpen) return false;
  if (
    shouldHidePremiumUpgradeForEntitlement(args.isPremium) ||
    args.state.premiumLocked
  ) {
    return false;
  }
  if (isPremiumUpgradePromptHiddenPath(args.pathname)) return false;
  const now = args.now ?? Date.now();
  if (
    isInNewFanGrace({
      now,
      accountCreatedAt: args.accountCreatedAt,
      firstSeenAt: args.state.firstSeenAt,
    })
  ) {
    return false;
  }
  if (!args.state.dismissed) return true;
  return canResurfacePremiumUpgradePrompt(args.state, now);
}

/** Stamp the first time this device saw the fan. Keeps an existing stamp. */
export function stampPremiumUpgradeFirstSeen(
  state: PremiumUpgradePromptState,
  now: number,
): PremiumUpgradePromptState {
  if (state.firstSeenAt) return state;
  return { ...state, firstSeenAt: new Date(now).toISOString() };
}

export function incrementPremiumUpgradePromptViews(
  state: PremiumUpgradePromptState,
): PremiumUpgradePromptState {
  if (state.premiumLocked || !state.dismissed) return state;
  return { ...state, views: state.views + 1 };
}

/**
 * Count App Router navigations after dismiss. First paint and same-path
 * updates (search params, re-renders) do not increment.
 */
export function recordPremiumUpgradeNavigation(
  state: PremiumUpgradePromptState,
  previousPath: string | null,
  nextPath: string,
): PremiumUpgradePromptState {
  const previous = previousPath?.trim() || null;
  const next = nextPath.trim() || "/";
  if (previous == null || previous === next) return state;
  return incrementPremiumUpgradePromptViews(state);
}

export function dismissPremiumUpgradePrompt(
  state: PremiumUpgradePromptState,
  now: number = Date.now(),
): PremiumUpgradePromptState {
  return {
    ...state,
    dismissed: true,
    views: 0,
    dismissCount: state.dismissCount + 1,
    lastDismissedAt: new Date(now).toISOString(),
  };
}

export function lockPremiumUpgradePrompt(
  state: PremiumUpgradePromptState = EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
): PremiumUpgradePromptState {
  return { ...state, dismissed: true, views: 0, premiumLocked: true };
}

export function applyPremiumEntitlementToPromptState(
  state: PremiumUpgradePromptState,
  isPremiumViewer: boolean,
): PremiumUpgradePromptState {
  if (!shouldHidePremiumUpgradeForEntitlement(isPremiumViewer)) return state;
  if (state.premiumLocked) return state;
  return lockPremiumUpgradePrompt(state);
}

export function pickFirstShowDelayMs(random = Math.random): number {
  const span = FIRST_SHOW_DELAY_MS_MAX - FIRST_SHOW_DELAY_MS_MIN;
  return FIRST_SHOW_DELAY_MS_MIN + Math.floor(random() * (span + 1));
}
