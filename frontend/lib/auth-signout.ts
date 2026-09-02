/**
 * Sign-out paths and cookie teardown.
 *
 * Menu Sign out must actually clear the Supabase session. Two failure modes
 * we hit in the Kevin/Dash/Lyra walk:
 *  1. Testers hit GET /logout or /signout → 404 (only POST /auth/signout existed).
 *  2. Middleware getUser() refreshed auth cookies onto the same response that
 *     signOut() tried to clear, so the fan stayed signed in.
 */

export const SIGNOUT_PATHS = ["/auth/signout", "/logout", "/signout"] as const;

export type SignOutPath = (typeof SIGNOUT_PATHS)[number];

export function isSignOutPath(pathname: string): boolean {
  return (SIGNOUT_PATHS as readonly string[]).includes(pathname);
}

/** Supabase SSR cookie names: sb-<ref>-auth-token, plus chunked .0/.1 suffixes. */
export function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("auth-token");
}

export type CookieToClear = { name: string };

/**
 * Names to expire on the outgoing sign-out response. Always include the
 * request's current auth cookies so leftover chunks cannot revive the session.
 */
export function signOutCookieNames(existing: CookieToClear[]): string[] {
  const names = new Set<string>();
  for (const cookie of existing) {
    if (isSupabaseAuthCookie(cookie.name)) names.add(cookie.name);
  }
  return [...names];
}

export const SIGNOUT_REDIRECT_PATH = "/";
