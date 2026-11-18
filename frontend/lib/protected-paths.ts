/**
 * Paths that need a signed-in fan. The proxy sends signed-out visitors
 * straight to /login with a real redirect, before any page renders.
 *
 * /me was missing (port of Brand Engage Pro #190): its pages redirected
 * from inside the page, after the loading skeleton had already been sent,
 * so a signed-out visitor opening a link such as /me/card could be left on
 * an empty shell.
 *
 * Matched by whole path segment, so /me does not catch /media or /menu,
 * and /admin does not catch /administrators.
 */
export const PROTECTED_PREFIXES = ["/admin", "/inbox", "/me"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
