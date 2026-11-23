/**
 * Live /terms, /privacy, and /rewards-terms still disagree with
 * /cancellation-refund and with each other. These rewrites run when a
 * policy is loaded, so the public pages match before Kevin applies
 * 0097_policy_copy_alignment.sql by hand.
 *
 * Founding Fan rule (same sentence as cancellation section 3):
 * keep the badge and 1.5× points as long as the account stays active.
 * The forfeiture sentences live in policy_pages only. They are not in
 * a merged migration.
 *
 * Age: stored /terms and /privacy still say 18+. This rewrites the
 * public pages to Brand Engage Pro's join rule: 13 or older, a parent
 * or guardian's permission for ages 13 to 17, and no one under 13.
 * Paid memberships and text alerts stay 18 and older in product code.
 * These helpers do not write policy_pages.
 */
import {
  FOUNDING_FAN_FREE_BADGE,
  FOUNDING_FAN_KEEP_RULE,
  FOUNDING_FAN_PREMIUM_SEPARATE,
} from "./cancellation-refund-founding-status.ts";

export const TERMS_FOUNDING_FAN_FORFEITURE =
  "If you terminate or cancel your subscription you will lose any Fan Engage Pro Rewards Program rewards points, and if you were a Founding Fan, your Founding Fan status will be forfeited.";

export const TERMS_FOUNDING_FAN_REPLACEMENT = [
  "Cancelling a Premium subscription does not forfeit Founding Fan status.",
  FOUNDING_FAN_FREE_BADGE,
  FOUNDING_FAN_KEEP_RULE,
  "Closing the account ends Founding Fan status.",
  FOUNDING_FAN_PREMIUM_SEPARATE,
].join(" ");

export const REWARDS_FOUNDING_FAN_FORFEITURE =
  "Founding Fan status is forfeited if the Founding Fan's account is closed or their Premium subscription lapses.";

const REWARDS_FOUNDING_FAN_OLD = [
  "Founding Fan Tier. Founding Fan is a limited, one-time-only membership designation available to the first qualifying fans who purchase a Founding Fan subscription within a defined slot window established by the applicable Artists. Founding Fan status is permanent and non-transferable. Founding Fans receive: (i) locked-in subscription pricing at the rate in effect at the time of their Founding Fan purchase for the life of their active membership; (ii) a numbered Founding Fan badge displayed on their profile; (iii) access to Founder-only rewards within the applicable Artist's Rewards catalog; and (iv) recognition on the public Founder Wall page for that Artist's community.",
  REWARDS_FOUNDING_FAN_FORFEITURE,
].join(" ");

export const REWARDS_FOUNDING_FAN_REPLACEMENT = [
  "Founding Fan Tier.",
  FOUNDING_FAN_FREE_BADGE,
  FOUNDING_FAN_KEEP_RULE,
  "Cancelling Premium does not forfeit Founding Fan status. Closing the account ends Founding Fan status.",
  FOUNDING_FAN_PREMIUM_SEPARATE,
].join(" ");

export const PRIVACY_UNDER_13_HEADING = "CHILDREN UNDER THE AGE OF 13";

export const PRIVACY_UNDER_13_BODY =
  "Our Website is not intended for children under 13 years of age. No one under age 13 may provide any information to or on the Website. We do not knowingly collect Personal Information from children under 13. If you are under 13, do not use or provide any information on this Website or on or through any of its features/register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address or any screen name or user name you may use. If we learn we have collected or received Personal Information from a child under 13 without verification of parental consent, we will delete that information. If you believe we might have any information from or about a child under 13, please contact us (please see the ''Contact Us'' section below).";

export const PRIVACY_AGE_18_HEADING = "AGE REQUIREMENT";

export const PRIVACY_AGE_18_BODY =
  "The Services are intended for people 18 and older. You may not use this Website or register unless you are 18 or older. We do not knowingly collect Personal Information from anyone under 18. If you are under 18, do not use or provide any information on this Website, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address, or any screen name or user name you may use. If we learn we have collected or received Personal Information from someone under 18, we will delete that information. If you believe we might have any information from or about someone under 18, please contact us (please see the ''Contact Us'' section below).";

/**
 * Brand Engage Pro's approved join paragraph, in Fan Engage words.
 * Paid memberships and text alerts stay 18 and older elsewhere.
 */
export const ACCOUNT_AGE_RULE =
  "Fans must be 13 or older. A fan who is 13, 14, 15, 16, or 17 may join only with a parent or guardian's permission. No one under 13 may use Fan Engage Pro or give us information.";

/** Same promise as Brand Engage Pro's registration line, pointed at this page's AGE REQUIREMENT heading. */
export const TERMS_AGE_REPRESENTATION =
  "You meet the age rule in AGE REQUIREMENT. If you are 13 to 17, a parent or guardian has said you may join.";

/**
 * Brand Engage Pro's privacy age section, without the brand-account
 * sentence and without a teen text opt-in. Fan Engage texts stay 18+.
 */
export const PRIVACY_AGE_RULE_BODY =
  "Fans must be 13 or older. A fan who is 13 to 17 may join only with a parent or guardian's permission. No one under 13 may use this Website or give us information. Our Website is not intended for children under 13 years of age. No one under age 13 may provide any information to or on the Website. We do not knowingly collect Personal Information from children under 13. If you are under 13, do not use or provide any information on this Website or on or through any of its features, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address, or any screen name or user name you may use. If we learn we have collected or received Personal Information from a child under 13, we will delete that information. If you believe we might have any information from or about a child under 13, please contact us (please see the ''Contact Us'' section below).";

const TERMS_AGE_SENTENCES: ReadonlyArray<readonly [string, string]> = [
  ["You must be 18 years or older to use Fan Engage.", ACCOUNT_AGE_RULE],
  ["You must be 13 years or older to use Fan Engage.", ACCOUNT_AGE_RULE],
  ["IF YOU ARE UNDER AGE 18, YOU MAY NOT USE THIS SITE.", "IF YOU ARE UNDER AGE 13, YOU MAY NOT USE THIS SITE."],
  [
    "The Services are intended for people 18 and older. You may not register as a User unless you are 18 or older.",
    ACCOUNT_AGE_RULE,
  ],
  [
    "We will terminate with or without notice any User who we believe is under the age of 18.",
    "We will terminate with or without notice any User who we believe is under the age of 13.",
  ],
  ["You are 18 years old or older.", TERMS_AGE_REPRESENTATION],
];

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

export function applyTermsFoundingFanStatus(content: string): string {
  return replaceFlexible(content, TERMS_FOUNDING_FAN_FORFEITURE, TERMS_FOUNDING_FAN_REPLACEMENT);
}

/** Account age is 13+. Paid memberships and texts stay 18+ in product code. */
export function applyTermsMinimumAge(content: string): string {
  let next = applyLegalEntityName(content);
  for (const [from, to] of TERMS_AGE_SENTENCES) {
    next = next.replaceAll(from, to);
  }
  return next;
}

export function applyLegalEntityName(content: string): string {
  return content.replaceAll("FEP, Inc.", "Fan Engage Pro LLC").replaceAll("FEP Inc.", "Fan Engage Pro LLC");
}

export function applyPrivacyAgeRequirement(content: string): string {
  let next = applyLegalEntityName(content);
  if (next.includes(PRIVACY_UNDER_13_HEADING)) {
    next = replaceFlexible(
      next,
      `${PRIVACY_UNDER_13_HEADING}\n\n${PRIVACY_UNDER_13_BODY}`,
      `${PRIVACY_AGE_18_HEADING}\n\n${PRIVACY_AGE_RULE_BODY}`,
    );
  }
  if (next.includes(PRIVACY_AGE_18_BODY)) {
    next = replaceFlexible(next, PRIVACY_AGE_18_BODY, PRIVACY_AGE_RULE_BODY);
  }
  return next;
}

export function applyRewardsFoundingFanStatus(content: string): string {
  return replaceFlexible(content, REWARDS_FOUNDING_FAN_OLD, REWARDS_FOUNDING_FAN_REPLACEMENT);
}
