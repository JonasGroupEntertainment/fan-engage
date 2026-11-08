/**
 * Stored /terms still say Premium billing is monthly-only and starts the
 * day the fan signs up. Raymond's wording for review is an eligible
 * seven-day free trial, with monthly or yearly billing.
 *
 * This runs when terms are loaded. It does not define who is eligible,
 * a price, or when the first charge is collected. It does not change
 * Founding Fan, age, refunds, or the separate "billed monthly" sentence
 * that also covers messaging, add-ons, and one-time charges.
 * No database migration.
 */
export const TERMS_MONTHLY_ONLY_BILLING = "Billing cycles are set on a monthly basis";

export const TERMS_MONTHLY_OR_YEARLY_BILLING = "Billing cycles are monthly or yearly";

export const TERMS_SIGNUP_DAY_BILLING =
  "We will begin billing your payment method for the Services on the day that you sign up for such Services, regardless of whether you have fully completed your account as of that date.";

/** Fan-facing form of Raymond's sentence. "Should offer" is the instruction, not the terms voice. */
export const TERMS_ELIGIBLE_TRIAL =
  "FEP offers an eligible seven-day free trial, with monthly or yearly billing.";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceFlexible(source: string, from: string, to: string): string {
  const pattern = from
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  return source.replace(new RegExp(pattern, "g"), to);
}

export function applyTermsPremiumBilling(content: string): string {
  let next = replaceFlexible(content, TERMS_MONTHLY_ONLY_BILLING, TERMS_MONTHLY_OR_YEARLY_BILLING);
  next = replaceFlexible(next, TERMS_SIGNUP_DAY_BILLING, TERMS_ELIGIBLE_TRIAL);
  return next;
}
