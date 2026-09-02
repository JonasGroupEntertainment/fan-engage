import { isSupabaseAuthCookie } from "./auth-signout.ts";
import { sanitizeNextPath } from "./app-url.ts";
import { isOnboardingPath } from "./guest-signup.ts";

export type CookieName = { name: string };

export function hasSupabaseAuthCookies(cookies: CookieName[]): boolean {
  return cookies.some((cookie) => isSupabaseAuthCookie(cookie.name));
}

/** Browser `document.cookie` / Cookie header — same names as request cookies. */
export function hasSupabaseAuthCookiesFromHeader(cookieHeader: string): boolean {
  if (!cookieHeader.trim()) return false;
  return cookieHeader.split(";").some((part) => {
    const name = part.split("=")[0]?.trim() ?? "";
    return isSupabaseAuthCookie(name);
  });
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
 * Signed-in (or cookie-present) visitors must not sit on /login. Cookie-only
 * sessions only follow next when that surface stays put; otherwise send them
 * to /onboarding so /inbox?next cannot bounce login ↔ protected.
 */
export function signedInLoginRedirectPath(opts: {
  user: unknown | null;
  cookies: CookieName[];
  nextPath: string | null | undefined;
}): string | null {
  const next = sanitizeNextPath(opts.nextPath);
  if (opts.user) return next;
  if (!hasSupabaseAuthCookies(opts.cookies)) return null;
  if (isOnboardingPath(next) || next === "/") return next;
  return "/onboarding";
}
