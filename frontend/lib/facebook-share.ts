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

/**
 * How the Facebook button should share on this device.
 *
 * On a phone or tablet, a link to facebook.com is handed to the Facebook
 * app, and the app ignores the share page: it just opens the feed, with no
 * post started and no link (reported by a fan on an iPhone, 2026-11-22).
 * We know of no way for a web page to start a post inside the app without
 * a Facebook app id. What does work is the
 * device's own share sheet: the fan picks Facebook there and the app opens
 * its post composer with the link attached. Facebook's own tools do the
 * same when the app is installed.
 *
 * On a computer there is no app in the way, so Facebook's share window is
 * opened as before.
 */
export type FacebookShareMode = "share_sheet" | "facebook_window";

export function facebookShareMode(device: {
  /** The browser can open the device's share sheet (navigator.share). */
  hasShareSheet: boolean;
  /** The main way of pointing is a finger: a phone or a tablet. */
  isTouchDevice: boolean;
}): FacebookShareMode {
  return device.hasShareSheet && device.isTouchDevice ? "share_sheet" : "facebook_window";
}

