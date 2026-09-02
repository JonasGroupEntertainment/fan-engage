/**
 * Soft launch: RaeLynn marketplace / merch catalog is NOT open yet
 * (provider issues). Guest-facing entry points must show Coming soon —
 * not a fake shop, not Shopify + empty marketplace dual CTAs.
 *
 * Flip when ready: set NEXT_PUBLIC_MARKETPLACE_LIVE=true in Vercel and redeploy.
 * Expected ~1 month after soft launch (ops target, not a guest promise date).
 *
 * Community Pre-Orders / Merch Drops chips use this same gate so they
 * cannot reappear while physical merch is still Coming soon.
 */

export type MarketplaceLiveEnv = {
  NEXT_PUBLIC_MARKETPLACE_LIVE?: string;
};

/** Commerce tags that imply a purchasable merch drop / pre-order. */
export const MERCH_COMMUNITY_TAGS = ["merch_drop", "pre_order"] as const;

export function isMarketplaceLive(
  env: MarketplaceLiveEnv = {
    NEXT_PUBLIC_MARKETPLACE_LIVE: process.env.NEXT_PUBLIC_MARKETPLACE_LIVE,
  },
): boolean {
  return env.NEXT_PUBLIC_MARKETPLACE_LIVE === "true";
}

export function isMerchCommunityTag(tag: string): boolean {
  const key = tag.trim().toLowerCase();
  return (MERCH_COMMUNITY_TAGS as readonly string[]).includes(key);
}

export function filterCommunityTagsForMarketplace<T extends { tag: string }>(
  tags: T[],
  marketplaceLive: boolean,
): T[] {
  if (marketplaceLive) return tags;
  return tags.filter((t) => !isMerchCommunityTag(t.tag));
}

export function sanitizeCommunityTagFilter(
  tag: string | null | undefined,
  marketplaceLive: boolean,
): string | null {
  const trimmed = (tag ?? "").trim();
  if (!trimmed) return null;
  if (!marketplaceLive && isMerchCommunityTag(trimmed)) return null;
  return trimmed;
}
