/**
 * Generate tracking URL with UTM parameters for influencer campaigns.
 * Uses influencer handle and promo code for attribution.
 */

export interface InfluencerTrackingParams {
  baseUrl?: string;
  handle: string;
  promoCode: string;
}

export function generateInfluencerTrackingUrl(params: InfluencerTrackingParams): string {
  const {
    baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://fanengagepro.com",
    handle,
    promoCode,
  } = params;

  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", handle);
  url.searchParams.set("utm_medium", "influencer");
  url.searchParams.set("utm_campaign", promoCode);

  return url.toString();
}

/**
 * Parse UTM parameters from URL to identify influencer source.
 */
export function parseInfluencerUTM(urlOrSearch: string): {
  handle: string | null;
  promoCode: string | null;
} | null {
  try {
    let search: URLSearchParams;

    if (urlOrSearch.startsWith("?")) {
      search = new URLSearchParams(urlOrSearch);
    } else if (urlOrSearch.includes("?")) {
      const [, queryString] = urlOrSearch.split("?");
      search = new URLSearchParams(queryString);
    } else {
      return null;
    }

    const handle = search.get("utm_source");
    const promoCode = search.get("utm_campaign");

    if (handle || promoCode) {
      return { handle, promoCode };
    }

    return null;
  } catch {
    return null;
  }
}
