/**
 * The address that opens Facebook's own "share this link" window.
 *
 * Facebook takes only the link. The picture, title and description in the
 * post come from the page behind the link (its social preview tags), so the
 * fan's invite link shows the same preview the invite page already has.
 * No Facebook app id, script or tracking pixel is involved: this is a plain
 * link to facebook.com that the fan chooses to open.
 *
 * Pure rules, no browser or server imports, so `node --test` can load this.
 */

const FACEBOOK_SHARE_PAGE = "https://www.facebook.com/sharer/sharer.php";

/** Passed to window.open so the new window cannot reach back into our page. */
export const FACEBOOK_WINDOW_FEATURES = "noopener,noreferrer";

/**
 * Facebook's share window for a link, or null when the link is not a full
 * web address (Facebook cannot read a relative path or another scheme).
 */
export function facebookShareUrl(
  link: string | null | undefined,
): string | null {
  if (typeof link !== "string" || link.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return `${FACEBOOK_SHARE_PAGE}?u=${encodeURIComponent(parsed.toString())}`;
}
