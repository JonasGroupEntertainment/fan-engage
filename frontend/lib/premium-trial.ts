/**
 * Rules for the 7-day Premium free trial. Pure module, no imports, so it
 * can be unit tested and shared by checkout, the webhook, and the page.
 *
 * One trial per account: a fan who has ever had a Stripe subscription, or
 * ever held a paid membership in any community, pays from day one.
 *
 * Paid perks wait for the first real payment. A trialing fan gets Premium
 * access, but not the monthly credit, a founder slot, or referral points
 * for their referrer. Those land when the trial converts to active.
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

/** The $0 invoice Stripe issues at trial start must not refresh the credit. */
export function invoiceGrantsCredit(amountPaidCents: number | null | undefined): boolean {
  return typeof amountPaidCents === "number" && amountPaidCents > 0;
}
