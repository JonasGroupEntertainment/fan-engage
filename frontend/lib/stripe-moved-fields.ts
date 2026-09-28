/**
 * Readers for Stripe fields that moved in newer API versions.
 *
 * The webhook payload shape follows the API version set on the Stripe
 * webhook endpoint (or the account default), not the SDK version. So we
 * read the new location first and fall back to the old one:
 *
 *   subscription.current_period_end
 *     moved to subscription.items.data[].current_period_end (2025-03-31.basil)
 *   invoice.subscription
 *     moved to invoice.parent.subscription_details.subscription (2025-03-31.basil)
 *
 * Inputs are typed loosely on purpose so both old and new payloads (and
 * plain test fixtures) are accepted without casts at the call site.
 */

type SubscriptionLike = {
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> | null } | null;
};

type SubscriptionRef = string | { id?: string | null } | null | undefined;

type InvoiceLike = {
  subscription?: SubscriptionRef;
  parent?: {
    subscription_details?: { subscription?: SubscriptionRef } | null;
  } | null;
};

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Unix seconds for the end of the current billing period, or null.
 * New shape: the latest current_period_end across subscription items
 * (a single-price subscription has exactly one). Old shape: the
 * top-level current_period_end.
 */
export function subscriptionPeriodEndSeconds(sub: unknown): number | null {
  if (!sub || typeof sub !== "object") return null;
  const s = sub as SubscriptionLike;

  const itemEnds = (s.items?.data ?? [])
    .map((item) => item?.current_period_end)
    .filter(isUnixSeconds);
  if (itemEnds.length > 0) return Math.max(...itemEnds);

  return isUnixSeconds(s.current_period_end) ? s.current_period_end : null;
}

/** ISO timestamp version of subscriptionPeriodEndSeconds. */
export function subscriptionPeriodEndIso(sub: unknown): string | null {
  const seconds = subscriptionPeriodEndSeconds(sub);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

function refToId(ref: SubscriptionRef): string | null {
  if (typeof ref === "string") return ref.length > 0 ? ref : null;
  if (ref && typeof ref === "object" && typeof ref.id === "string") {
    return ref.id.length > 0 ? ref.id : null;
  }
  return null;
}

/**
 * Subscription id an invoice belongs to, or null for a one-off invoice.
 * Handles both the id string and an expanded Subscription object.
 */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object") return null;
  const inv = invoice as InvoiceLike;
  return (
    refToId(inv.parent?.subscription_details?.subscription) ??
    refToId(inv.subscription)
  );
}
