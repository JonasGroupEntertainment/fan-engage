import { sanitizeNextPath } from "./app-url.ts";

/** Email OTP types accepted from Supabase callback query params. */
export const AUTH_EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

export type AuthEmailOtpType = (typeof AUTH_EMAIL_OTP_TYPES)[number];

export function isAuthEmailOtpType(
  value: string | null | undefined,
): value is AuthEmailOtpType {
  return (
    typeof value === "string" &&
    (AUTH_EMAIL_OTP_TYPES as readonly string[]).includes(value)
  );
}

export type AuthCallbackSearch = {
  code: string | null;
  tokenHash: string | null;
  type: AuthEmailOtpType | null;
  next: string;
  providerError: string | null;
};

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isRecoveryNext(next: string): boolean {
  return next === "/reset-password" || next.startsWith("/reset-password?");
}

/** Default recovery links to the set-password form when `next` is omitted. */
export function resolveAuthCallbackNext(
  rawNext: string | null | undefined,
  type: string | null | undefined,
): string {
  if ((rawNext == null || rawNext.trim() === "") && type === "recovery") {
    return "/reset-password";
  }
  return sanitizeNextPath(rawNext);
}

export function parseAuthCallbackSearch(
  searchParams: Pick<URLSearchParams, "get">,
): AuthCallbackSearch {
  const typeRaw = emptyToNull(searchParams.get("type"));
  const type = isAuthEmailOtpType(typeRaw) ? typeRaw : null;
  return {
    code: emptyToNull(searchParams.get("code")),
    tokenHash: emptyToNull(searchParams.get("token_hash")),
    type,
    next: resolveAuthCallbackNext(searchParams.get("next"), type),
    providerError:
      emptyToNull(searchParams.get("error_description")) ??
      emptyToNull(searchParams.get("error")),
  };
}

/**
 * Same-browser 2026-08-26 failure. Server exchange cannot see the PKCE
 * cookie on the cross-site redirect from *.supabase.co (SameSite=Lax).
 */
export function isPkceVerifierMissingError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("code verifier not found") ||
    (normalized.includes("pkce") && normalized.includes("verifier"))
  );
}

export function authCallbackUserMessage(next: string): string {
  if (isRecoveryNext(next)) {
    return "This password reset link has expired or could not be verified. Request a new one.";
  }
  return "This sign-in link has expired or could not be verified. Please sign in again.";
}

export function authCallbackIncompleteMessage(next: string): string {
  if (isRecoveryNext(next)) {
    return "This password reset link is incomplete. Request a new one.";
  }
  return "This sign-in link is incomplete. Please sign in again.";
}

/** Relative error path only — never an external URL. */
export function authCallbackErrorPath(input: {
  next: string;
  message: string;
  forgotPasswordEnabled: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("error", input.message);
  if (isRecoveryNext(input.next) && input.forgotPasswordEnabled) {
    return `/forgot-password?${params.toString()}`;
  }
  params.set("next", input.next);
  return `/login?${params.toString()}`;
}

/** Browser-side exchange when the server cannot read the PKCE cookie. */
export function authCallbackCompletePath(input: {
  code?: string | null;
  tokenHash?: string | null;
  type?: string | null;
  next: string;
}): string {
  const params = new URLSearchParams();
  if (input.code) params.set("code", input.code);
  if (input.tokenHash) params.set("token_hash", input.tokenHash);
  if (input.type && isAuthEmailOtpType(input.type)) {
    params.set("type", input.type);
  }
  params.set("next", sanitizeNextPath(input.next));
  return `/auth/complete?${params.toString()}`;
}
