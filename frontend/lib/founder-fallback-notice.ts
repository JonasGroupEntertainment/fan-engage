/**
 * In-app notice for a fan whose founder-price subscription was moved to
 * the standard price because the founder cap filled before their trial
 * ended. Pure module, no imports, so the copy can be unit tested.
 */

export const FOUNDER_FALLBACK_NOTICE_KIND = "price_change";
export const FOUNDER_FALLBACK_NOTICE_URL = "/account/billing";

export type FounderFallbackNoticeInput = {
  subscriptionId: string;
  communityName: string;
  /** Standard price in the smallest currency unit, e.g. cents. */
  unitAmount: number | null | undefined;
  currency: string | null | undefined;
  interval: string | null | undefined;
  /** When the next renewal bills at the new price (ISO string). */
  renewsAtIso: string | null | undefined;
};

export type FounderFallbackNotice = {
  kind: string;
  title: string;
  body: string;
  url: string;
  icon: string;
  dedupKey: string;
};

/** "$9.99 a month", or null when the amount is unknown. */
export function formatStandardPrice(
  unitAmount: number | null | undefined,
  currency: string | null | undefined,
  interval: string | null | undefined,
): string | null {
  if (typeof unitAmount !== "number" || !Number.isFinite(unitAmount) || unitAmount < 0) {
    return null;
  }
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  }).format(unitAmount / 100);
  if (interval === "year") return `${money} a year`;
  if (interval === "month") return `${money} a month`;
  return money;
}

/** "November 18, 2026", or null for a missing or bad date. */
export function formatRenewalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function founderFallbackNotice(input: FounderFallbackNoticeInput): FounderFallbackNotice {
  const price = formatStandardPrice(input.unitAmount, input.currency, input.interval);
  const date = formatRenewalDate(input.renewsAtIso);
  const priceText = price ? `the standard price of ${price}` : "the standard price";
  const whenText = date ? `starting ${date}` : "starting with your next renewal";

  return {
    kind: FOUNDER_FALLBACK_NOTICE_KIND,
    title: "Your membership price is changing",
    body:
      `The founding-fan spots for ${input.communityName} filled up before your free trial ended, ` +
      `so your membership will renew at ${priceText} ${whenText}. ` +
      "Nothing changes before then. You can manage or cancel your membership anytime from Billing.",
    url: FOUNDER_FALLBACK_NOTICE_URL,
    icon: "💳",
    dedupKey: `founder-fallback:${input.subscriptionId}`,
  };
}
