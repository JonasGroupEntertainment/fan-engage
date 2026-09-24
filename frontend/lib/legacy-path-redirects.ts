/**
 * Short public aliases that used to 404.
 *
 * /create-account and /join → /signup, keeping the full query string
 * (referral ?ref= in particular).
 * /events → the RaeLynn community page. Community routes live at
 * /artists/[slug]/community; the launch community slug is raelynn
 * (DEFAULT_COMMUNITY_ID). /artists/raelynn is the artist hub, not the
 * community feed.
 *
 * Exact paths only — /artist-portal/events and /api/events/* stay put.
 */

export const RAELYNN_COMMUNITY_PATH = "/artists/raelynn/community";

const SIGNUP_ALIAS_PATHS = new Set(["/create-account", "/join"]);

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function normalizeSearch(search: string): string {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
}

/**
 * Same-origin path + original query, or null when this request is not
 * one of the aliases. Status is 307 so browsers do not cache a permanent
 * move if the target changes.
 */
export function legacyGuestRedirect(
  pathname: string,
  search = "",
): string | null {
  const path = normalizePath(pathname);
  const qs = normalizeSearch(search);
  if (SIGNUP_ALIAS_PATHS.has(path)) return `/signup${qs}`;
  if (path === "/events") return `${RAELYNN_COMMUNITY_PATH}${qs}`;
  return null;
}
