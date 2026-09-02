import { isSupabaseAuthCookie } from "./auth-signout.ts";

export type CookieName = { name: string };

export function hasSupabaseAuthCookies(cookies: CookieName[]): boolean {
  return cookies.some((cookie) => isSupabaseAuthCookie(cookie.name));
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
