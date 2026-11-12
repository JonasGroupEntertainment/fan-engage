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
  current_period_end?: unknown;
  items?:
    | { data?: Array<{ current_period_end?: unknown }> | null }
    | Array<{ current_period_end?: unknown }>
    | null;
};

type SubscriptionRef = string | { id?: string | null } | null | undefined;

type InvoiceLike = {
  subscription?: SubscriptionRef;
  period_end?: unknown;
  parent?: {
    subscription_details?: { subscription?: SubscriptionRef } | null;
  } | null;
  lines?: {
    data?: Array<{ period?: { end?: unknown } | null } | null> | null;
  } | null;
};

function unixSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function subscriptionItems(sub: SubscriptionLike): Array<{ current_period_end?: unknown }> {
  const items = sub.items;
  if (Array.isArray(items)) return items;
  if (items && Array.isArray(items.data)) return items.data;
  return [];
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

  const itemEnds = subscriptionItems(s)
    .map((item) => unixSeconds(item?.current_period_end))
    .filter((value): value is number => value != null);
  if (itemEnds.length > 0) return Math.max(...itemEnds);

  return unixSeconds(s.current_period_end);
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

/**
 * Period end carried on an invoice when the subscription object is not
 * expanded. Prefers an expanded subscription (items, then top-level),
 * then the latest invoice line period.end, then the legacy invoice
 * period_end. Subscription-item current_period_end is the source of
 * truth once the subscription is loaded.
 */
export function invoicePeriodEndIso(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object") return null;
  const inv = invoice as InvoiceLike;
  const expanded = inv.parent?.subscription_details?.subscription ?? inv.subscription;
  if (expanded && typeof expanded === "object") {
    const fromSub = subscriptionPeriodEndIso(expanded);
    if (fromSub) return fromSub;
  }
  const lineEnds = (inv.lines?.data ?? [])
    .map((line) => unixSeconds(line?.period?.end))
    .filter((value): value is number => value != null);
  if (lineEnds.length > 0) {
    return new Date(Math.max(...lineEnds) * 1000).toISOString();
  }
  const top = unixSeconds(inv.period_end);
  return top == null ? null : new Date(top * 1000).toISOString();
}
