/**
 * Rules for the 7-day Premium free trial. Pure module, no imports, so it
 * can be unit tested and shared by checkout, the webhook, and the page.
 *
 * One trial per account: a fan who has ever had a Stripe subscription, or
 * ever held a paid membership in any community, pays from day one.
 *
 * Paid perks wait for the first real payment. A trialing fan gets Premium
 * access, but not the monthly credit, a founder slot, or referral points
 * for their referrer. Those land the first time the subscription is
 * genuinely paid: the trial invoice clears, or a declined first charge
 * later succeeds (Stripe dunning, or the fan updates their card). A
 * subscription that ends without a successful charge never gets them.
 */

export const TRIAL_DAYS = 7;

export type TrialHistory = {
  /** Subscriptions of any status on the fan's Stripe customer. */
  stripeSubscriptionCount: number;
  /** Membership rows that ever had a billing period (any community). */
  pastPaidMemberships: number;
};

export function isTrialEligible(history: TrialHistory): boolean {
  return history.stripeSubscriptionCount === 0 && history.pastPaidMemberships === 0;
}

/** True while paid perks should be held back. */
export function isTrialing(status: string | null | undefined): boolean {
  return status === "trialing";
}

/** True for the single update where a trial turns into a paid subscription. */
export function isTrialConversion(
  status: string | null | undefined,
  previousStatus: string | null | undefined,
): boolean {
  return previousStatus === "trialing" && status === "active";
}

/**
 * Statuses a subscription can leave on the way to its first successful
 * charge. `past_due`, `unpaid`, and `incomplete` cover a declined trial
 * invoice that Stripe retries, or a fan who updates their card.
 */
const FIRST_PAYMENT_FROM = new Set(["trialing", "past_due", "unpaid", "incomplete"]);

export type PaidPerkEvent =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.paid"
  | "invoice.payment_failed";

/**
 * Whether this Stripe event should grant the one-time paid perks
 * (founder slot and referral points). Callers must still be idempotent:
 * a clean conversion fires both `customer.subscription.updated`
 * (trialing → active) and `invoice.paid`, and a recovered decline fires
 * both `past_due → active` and `invoice.paid`.
 *
 * `alreadyPaid` is the membership's first real payment. Later renewals
 * and later dunning recoveries pass true and do not grant again.
 * Canceled, deleted, and failed-payment events never grant.
 */
export function shouldGrantConversionPerks(input: {
  event: PaidPerkEvent;
  status?: string | null;
  previousStatus?: string | null;
  amountPaidCents?: number | null;
  alreadyPaid?: boolean;
}): boolean {
  if (input.alreadyPaid) return false;
  switch (input.event) {
    case "customer.subscription.created":
      // Checkout without a trial is created already active. Trialing,
      // incomplete, and past_due wait for a real payment.
      return input.status === "active";
    case "customer.subscription.updated":
      return (
        input.status === "active" &&
        typeof input.previousStatus === "string" &&
        FIRST_PAYMENT_FROM.has(input.previousStatus)
      );
    case "invoice.paid":
      return invoiceGrantsCredit(input.amountPaidCents);
    case "customer.subscription.deleted":
    case "invoice.payment_failed":
      return false;
    default:
      return false;
  }
}

/** The $0 invoice Stripe issues at trial start must not refresh the credit. */
export function invoiceGrantsCredit(amountPaidCents: number | null | undefined): boolean {
  return typeof amountPaidCents === "number" && amountPaidCents > 0;
}

/** Same window the monthly-credit cron uses. */
export const CREDIT_REFRESH_DAYS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the $5 credit is due: never refreshed, or last refresh was long enough ago. */
export function creditRefreshDue(
  refreshedAt: string | null | undefined,
  nowMs: number,
): boolean {
  if (!refreshedAt) return true;
  const last = Date.parse(refreshedAt);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= CREDIT_REFRESH_DAYS * DAY_MS;
}

/**
 * invoice.paid refreshes the credit only when money was collected and
 * the 25-day window has elapsed. The $0 trial invoice does neither.
 */
export function invoiceShouldRefreshCredit(
  amountPaidCents: number | null | undefined,
  refreshedAt: string | null | undefined,
  nowMs: number,
): boolean {
  return invoiceGrantsCredit(amountPaidCents) && creditRefreshDue(refreshedAt, nowMs);
}

/**
 * Daily credit cron. Comped fans have no Stripe invoice, so they refresh
 * here. Premium fans refresh only after a real payment (`firstPaidAt`);
 * a trialing row is stored as premium and must not earn the credit early.
 * past_due waits for the invoice that actually clears.
 */
export function cronShouldRefreshCredit(input: {
  tier: string | null | undefined;
  firstPaidAt: string | null | undefined;
  refreshedAt: string | null | undefined;
  nowMs: number;
}): boolean {
  if (input.tier === "comped") return creditRefreshDue(input.refreshedAt, input.nowMs);
  if (input.tier !== "premium") return false;
  if (!input.firstPaidAt) return false;
  return creditRefreshDue(input.refreshedAt, input.nowMs);
}

/**
 * A fan who checked out at the founder price but did not get a founder
 * slot (the cap filled during their trial, or in the seconds before the
 * webhook ran) moves to the standard price, so nobody keeps a founder
 * price without the founder slot that goes with it.
 */
export function shouldMoveOffFounderPrice(
  tier: string | null | undefined,
  claimedSlot: unknown,
): boolean {
  if (tier !== "founder") return false;
  return !(typeof claimedSlot === "number" && claimedSlot > 0);
}
