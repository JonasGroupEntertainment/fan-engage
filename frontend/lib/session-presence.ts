import { isSupabaseSessionCookie } from "./auth-signout.ts";
import { sanitizeNextPath } from "./app-url.ts";
import { isOnboardingPath } from "./guest-signup.ts";

export type CookieName = { name: string; value?: string };

function sessionCookiePresent(cookie: CookieName): boolean {
  if (!isSupabaseSessionCookie(cookie.name)) return false;
  // Name-only checks still count. An explicit empty value does not: a failed
  // refresh writes sb-*-auth-token= with no session behind it.
  if (cookie.value !== undefined && cookie.value.trim() === "") return false;
  return true;
}

export function cookiesFromHeader(cookieHeader: string): CookieName[] {
  if (!cookieHeader.trim()) return [];
  return cookieHeader.split(";").map((part) => {
    const eq = part.indexOf("=");
    if (eq === -1) return { name: part.trim(), value: "" };
    return {
      name: part.slice(0, eq).trim(),
      value: part.slice(eq + 1).trim(),
    };
  });
}

export function hasSupabaseAuthCookies(cookies: CookieName[]): boolean {
  return cookies.some(sessionCookiePresent);
}

/** Browser `document.cookie` / Cookie header — same names as request cookies. */
export function hasSupabaseAuthCookiesFromHeader(cookieHeader: string): boolean {
  return hasSupabaseAuthCookies(cookiesFromHeader(cookieHeader));
}

/**
 * Bounce true guests off /onboarding. If auth cookies exist, getUser() can
 * briefly be null while the header still shows signed-in — stay put.
 */
export function shouldRedirectGuestFromOnboarding(opts: {
  user: unknown | null;
  cookies: CookieName[];
}): boolean {
  if (opts.user) return false;
  if (hasSupabaseAuthCookies(opts.cookies)) return false;
  return true;
}

export function onboardingClientGate(opts: {
  serverConfirmed: boolean;
  clientUser: unknown | null;
}): "ready" | "signed-out" {
  if (opts.serverConfirmed) return "ready";
  return opts.clientUser ? "ready" : "signed-out";
}

/**
 * /onboarding/mission has no server-confirmed email. Treat auth cookies the
 * same as a confirmed session so a brief getUser() miss cannot paint Sign in
 * → /login under a signed-in header.
 */
export function missionClientGate(opts: {
  clientUser: unknown | null;
  cookieHeader: string;
}): "ready" | "signed-out" {
  return onboardingClientGate({
    serverConfirmed: hasSupabaseAuthCookiesFromHeader(opts.cookieHeader),
    clientUser: opts.clientUser,
  });
}

/**
 * Confirmed sessions leave /login for `next`.
 *
 * A cookie without a user is not signed in. `/` is the signed-out landing,
 * and its Sign in link is `/login`, so sending that visitor to `/` loops
 * (production: leftover sb-*-auth-token or PKCE verifier → 307 Location: /).
 * Stay on the form.
 *
 * Cookie-only visitors may still follow an onboarding `next` (that page
 * stays put) or be sent to /onboarding instead of a protected `next`, so
 * /login?next=/inbox cannot bounce with middleware.
 */
export function signedInLoginRedirectPath(opts: {
  user: unknown | null;
  cookies: CookieName[];
  nextPath: string | null | undefined;
}): string | null {
  const next = sanitizeNextPath(opts.nextPath);
  if (opts.user) return next;
  if (!hasSupabaseAuthCookies(opts.cookies)) return null;
  if (next === "/") return null;
  if (isOnboardingPath(next)) return next;
  return "/onboarding";
}
