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

/**
 * Fan-facing form of the approved trial decision.
 * "Should offer" was the instruction. The page says what Premium includes.
 */
export const TERMS_ELIGIBLE_TRIAL =
  "Premium includes an eligible seven-day free trial, then monthly or yearly billing.";

export const COLORADO_ENTITY_SENTENCE =
  "Fan Engage Pro is operated by Fan Engage Pro LLC, a Colorado limited liability company.";

const NEW_SUBSCRIPTION_REFUND_WINDOW =
  "Refunds are available within 30 days of a new subscription purchase if you have not substantially used the service.";

const STORE_CREDIT_SENTENCES = [
  "Premium includes a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens.",
  "a $5.00 monthly credit applied to the User's account each billing cycle, redeemable toward marketplace items within that Artist's community.",
  "a $5.00 monthly credit applied to the User's account each billing cycle",
  "a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens",
];

const TERMS_PLACEHOLDER = "The Fan Engage Pro Terms of Use [here, provide link]";

const TERMS_LINK = "The Fan Engage Pro [Terms of Use](/terms)";

const PREMIUM_AND_CANCELLATION_PLACEHOLDER =
  "The [link] for upgrade to Premium access and the cancellation/refund policy are located at [/cancellation-refund] on the platform.";

const PREMIUM_AND_CANCELLATION_LINKS =
  "Upgrade to Premium at [Premium](/premium). The cancellation and refund policy is at [cancellation and refund policy](/cancellation-refund).";

const PRIVACY_PLACEHOLDER = "Privacy Policy [link]";

const PRIVACY_LINK = "[Privacy Policy](/privacy)";

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

function tidyPlaceholderProse(content: string): string {
  return content
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,])/g, "$1")
    .replace(/\bSee and\b/g, "See")
    .replace(/\n{3,}/g, "\n\n");
}

/** Real public routes. Rules for Use is deleted, not pointed at a new page. */
export function applyRewardsPlaceholderLinks(content: string): string {
  let next = content.replace(
    /\s+and the Fan Engage Pro Rules for Use and User Content(?: \[link\])?/g,
    "",
  );
  next = next.replace(
    /The Fan Engage Pro Rules for Use and User Content(?: \[link\])?[^.]*\./g,
    "",
  );
  next = next.replace(/\(no public page is published\)/g, "");
  next = next.replaceAll(TERMS_PLACEHOLDER, TERMS_LINK);
  next = replaceFlexible(next, PREMIUM_AND_CANCELLATION_PLACEHOLDER, PREMIUM_AND_CANCELLATION_LINKS);
  next = next.replaceAll(PRIVACY_PLACEHOLDER, PRIVACY_LINK);
  next = next.replaceAll("[/cancellation-refund]", "[cancellation and refund policy](/cancellation-refund)");
  next = next.replaceAll("[/terms]", "[Terms of Use](/terms)");
  next = next.replaceAll("[/privacy]", "[Privacy Policy](/privacy)");
  next = next.replaceAll("[/premium]", "[Premium](/premium)");
  next = next.replaceAll("[here, provide link]", "");
  next = next.replaceAll("[link]", "");
  next = next.replace(/\{\{[^}]+\}\}/g, "");
  next = next.replace(/\[([^\]]+)\]\(https?:\/\/example\.com[^)]*\)/gi, "$1");
  next = next.replace(/\[([^\]]+)\]\(#\)/g, "$1");
  return tidyPlaceholderProse(next);
}

function stripStoreCreditSentences(content: string): string {
  let next = content;
  for (const sentence of STORE_CREDIT_SENTENCES) {
    next = replaceFlexible(next, sentence, "");
  }
  return next;
}

const ARBITRATION_IN_COLORADO =
  "The place of the arbitration and each in person hearing shall be Colorado.";

const ARBITRATION_IN_NORTH_CAROLINA =
  "The place of the arbitration and each in person hearing shall be North Carolina.";

const ITEM4_SLUGS = new Set(["terms", "rewards_terms", "cancellation_refund"]);

/**
 * Help is hardcoded. Terms, rewards terms, and cancellation read
 * policy_pages, then this rewrite. Privacy is not accepted here.
 */
export function applyItem4PolicyCopy(slug: string, content: string): string {
  if (!ITEM4_SLUGS.has(slug)) return content;
  let next = content.replaceAll(
    "a North Carolina limited liability company",
    "a Colorado limited liability company",
  );
  next = next.replaceAll(ARBITRATION_IN_COLORADO, ARBITRATION_IN_NORTH_CAROLINA);
  if (slug === "terms") next = applyTermsPremiumBilling(next);
  if (next.includes("eligible seven-day free trial, then monthly or yearly billing")) {
    next = replaceFlexible(next, NEW_SUBSCRIPTION_REFUND_WINDOW, "");
  } else {
    next = replaceFlexible(next, NEW_SUBSCRIPTION_REFUND_WINDOW, TERMS_ELIGIBLE_TRIAL);
  }
  next = stripStoreCreditSentences(next);
  if (slug === "rewards_terms") next = applyRewardsPlaceholderLinks(next);
  if (!next.includes("eligible seven-day free trial, then monthly or yearly billing")) {
    next += `\n\n## Premium billing\n\n${TERMS_ELIGIBLE_TRIAL}`;
  }
  if (!next.includes("a Colorado limited liability company")) {
    next += `\n\n${COLORADO_ENTITY_SENTENCE}`;
  }
  return next.replace(/\n{3,}/g, "\n\n");
}
