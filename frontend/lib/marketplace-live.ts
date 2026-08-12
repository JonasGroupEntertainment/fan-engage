/**
 * Soft launch: RaeLynn marketplace / merch catalog is NOT open yet
 * (provider issues). Guest-facing entry points must show Coming soon —
 * not a fake shop, not Shopify + empty marketplace dual CTAs.
 *
 * Flip when ready: set NEXT_PUBLIC_MARKETPLACE_LIVE=true in Vercel and redeploy.
 * Expected ~1 month after soft launch (ops target, not a guest promise date).
 */
export function isMarketplaceLive(): boolean {
  return process.env.NEXT_PUBLIC_MARKETPLACE_LIVE === "true";
}
