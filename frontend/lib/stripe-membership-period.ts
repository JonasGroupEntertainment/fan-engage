import { subscriptionPeriodEndIso } from "./stripe-moved-fields.ts";

/**
 * Columns on fan_community_memberships that Stripe events must keep
 * in sync. subscription_tier is the status the app reads.
 *
 * current_period_end is omitted when unknown so a payload that does
 * not carry the field (it moved onto subscription items) cannot wipe
 * a value already stored. Callers retrieve the subscription first.
 */

export type MembershipPeriodEvent =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.paid";

export interface MembershipPeriodPatch {
  subscription_tier: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** null clears the column (subscription deleted). */
  stripe_subscription_id: string | null;
}

export function mapStripeSubscriptionStatus(status: string | null | undefined): string {
  switch (status) {
    case "active":
    case "trialing":
      return "premium";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    default:
      return "cancelled";
  }
}

export function membershipPeriodPatch(
  sub: unknown,
  event: MembershipPeriodEvent,
): MembershipPeriodPatch {
  const record = sub && typeof sub === "object" ? (sub as Record<string, unknown>) : {};
  const id = typeof record.id === "string" && record.id.length > 0 ? record.id : null;
  const status = typeof record.status === "string" ? record.status : null;
  const cancelAtPeriodEnd = record.cancel_at_period_end === true;
  const periodEnd = subscriptionPeriodEndIso(sub);

  if (event === "customer.subscription.deleted") {
    return {
      subscription_tier: "free",
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      stripe_subscription_id: null,
    };
  }

  if (event === "invoice.paid") {
    return {
      subscription_tier: "premium",
      current_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      stripe_subscription_id: id,
    };
  }

  return {
    subscription_tier: mapStripeSubscriptionStatus(status),
    current_period_end: periodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    stripe_subscription_id: id,
  };
}

/** Drop a null period end so the update does not clear a stored value. */
export function membershipPeriodColumns(
  patch: MembershipPeriodPatch,
): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    subscription_tier: patch.subscription_tier,
    cancel_at_period_end: patch.cancel_at_period_end,
    stripe_subscription_id: patch.stripe_subscription_id,
  };
  if (patch.current_period_end) {
    columns.current_period_end = patch.current_period_end;
  }
  return columns;
}

export function periodEndMissing(sub: unknown): boolean {
  return subscriptionPeriodEndIso(sub) == null;
}

export function checkoutFanCommunity(session: {
  metadata?: {
    fan_id?: string | null;
    community_id?: string | null;
    billing_period?: string | null;
  } | null;
  client_reference_id?: string | null;
}): {
  fanId: string | null;
  communityId: string | null;
  billingPeriod: "monthly" | "annual" | null;
} {
  const meta = session.metadata ?? {};
  let fanId = nonEmpty(meta.fan_id);
  let communityId = nonEmpty(meta.community_id);
  const ref = session.client_reference_id ?? "";
  if ((!fanId || !communityId) && ref.includes(":")) {
    const [refFan, refCommunity] = ref.split(":");
    fanId = fanId ?? nonEmpty(refFan);
    communityId = communityId ?? nonEmpty(refCommunity);
  }
  const billing = meta.billing_period;
  const billingPeriod = billing === "monthly" || billing === "annual" ? billing : null;
  return { fanId, communityId, billingPeriod };
}

/** Checkout Session.subscription is an id string or an expanded object. */
export function checkoutSubscriptionRef(session: {
  subscription?: unknown;
}): { id: string | null; expanded: unknown | null } {
  const sub = session.subscription;
  if (typeof sub === "string") {
    return { id: nonEmpty(sub), expanded: null };
  }
  if (sub && typeof sub === "object") {
    const id = nonEmpty((sub as { id?: unknown }).id);
    return { id, expanded: id ? sub : null };
  }
  return { id: null, expanded: null };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
