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
 * Age: /terms already says 18+. /privacy still has a children-under-13
 * section. This drafts 18+ on privacy to match terms. Signup behavior
 * is unchanged.
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

const TERMS_PLACEHOLDER_AGE_FROM = "You must be 13 years or older to use Fan Engage.";
const TERMS_PLACEHOLDER_AGE_TO = "You must be 18 years or older to use Fan Engage.";

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

/** Seed terms in 0009 still say 13+. Published terms already say 18+. */
export function applyTermsMinimumAge(content: string): string {
  return content.replaceAll(TERMS_PLACEHOLDER_AGE_FROM, TERMS_PLACEHOLDER_AGE_TO);
}

export function applyPrivacyAgeRequirement(content: string): string {
  if (!content.includes(PRIVACY_UNDER_13_HEADING)) return content;
  return replaceFlexible(
    content,
    `${PRIVACY_UNDER_13_HEADING}\n\n${PRIVACY_UNDER_13_BODY}`,
    `${PRIVACY_AGE_18_HEADING}\n\n${PRIVACY_AGE_18_BODY}`,
  );
}

export function applyRewardsFoundingFanStatus(content: string): string {
  return replaceFlexible(content, REWARDS_FOUNDING_FAN_OLD, REWARDS_FOUNDING_FAN_REPLACEMENT);
}
