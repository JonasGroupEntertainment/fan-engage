/**
 * Was this request sent by a page on this same site?
 *
 * Used to guard POST /logout so only this site can sign a fan out. Port
 * of Brand Engage Pro lib/same-origin-request.ts. Browsers set
 * Sec-Fetch-Site and Origin themselves and
 * pages cannot fake them.
 *   1. Sec-Fetch-Site, when sent, must be "same-origin".
 *   2. Otherwise Origin, when sent, must match the Host.
 *   3. With neither header (not a browser, e.g. curl) we allow it: a
 *      cross-site browser request always carries at least one of them.
 */
export interface SameOriginHeaders {
  secFetchSite: string | null;
  origin: string | null;
  host: string | null;
}

export function isSameOriginRequest({ secFetchSite, origin, host }: SameOriginHeaders): boolean {
  if (secFetchSite) return secFetchSite.toLowerCase() === "same-origin";
  if (origin) {
    if (origin === "null" || !host) return false;
    try {
      return new URL(origin).host.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }
  return true;
}

/** Read the three headers off a Request-like object. */
export function sameOriginHeadersOf(headers: { get(name: string): string | null }): SameOriginHeaders {
  return {
    secFetchSite: headers.get("sec-fetch-site"),
    origin: headers.get("origin"),
    host: headers.get("host") ?? headers.get("x-forwarded-host"),
  };
}
