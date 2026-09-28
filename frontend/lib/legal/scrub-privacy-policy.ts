import {
  OFFICIAL_CONTACT_MD_LINK,
  alignOfficialContactEmails,
} from "./official-contact.ts";

/**
 * Counsel-approved Privacy scrub (Kevin Jonas Sr, Sep 2026).
 *
 * Live `policy_pages.slug = 'privacy'` still contains nonprofit / donation /
 * volunteer / harm-reduction wording that does not belong to Fan Engage Pro,
 * plus mismatched contact addresses and an empty Contact Us email. This
 * helper rewrites only those phrases so /privacy stays accurate even before
 * the matching SQL migration is applied. Other policies pass through
 * unchanged. Commercial and fan-product language is left in place.
 */
export const PRIVACY_COUNSEL_EFFECTIVE_DATE = "2026-09-24";

const PRIOR_PRIVACY_EFFECTIVE_DATE = "2026-06-19";

const PROCESSING_FROM =
  "FEP processes your Personal Information to improve our Services, manage accounts, fulfill requests, accept donations, accept volunteer applications and manage volunteers, accept and process event applications, further our mission, and promote harm reduction. We process this information based on consent, contractual necessity, or legitimate interests aligned with our vision.";

const PROCESSING_TO =
  "FEP processes your Personal Information to improve our Services, manage accounts, fulfill requests, and accept and process event applications. We process this information based on consent, contractual necessity, or legitimate interests.";

const CCPA_FROM =
  "While the California Consumer Privacy Act (CCPA) primarily applies to for-profit businesses, our privacy practices align with CCPA's goals of transparency and security where relevant";

const CCPA_TO =
  "The California Consumer Privacy Act (CCPA) applies to Fan Engage Pro as a for-profit business. Where it applies, our privacy practices follow CCPA's requirements for transparency and security";

const LAST_UPDATED_FROM = "This Policy was last updated on June 19, 2026.";
const LAST_UPDATED_TO = "This Policy was last updated on September 24, 2026.";

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

function fillEmptyPrivacyContact(content: string): string {
  return content.replace(
    /Fan Engage Pro Legal Team\s*Email:\s*$/i,
    `Fan Engage Pro Legal Team\nEmail: ${OFFICIAL_CONTACT_MD_LINK}`,
  );
}

export function applyPrivacyCounselScrub(content: string): string {
  let next = content.replaceAll("\u200b", "");
  next = replaceFlexible(next, PROCESSING_FROM, PROCESSING_TO);
  next = replaceFlexible(next, CCPA_FROM, CCPA_TO);
  next = replaceFlexible(
    next,
    "To allow you to request services or volunteer for events;",
    "To allow you to request services;",
  );
  next = replaceFlexible(next, "purchase or donation", "purchase");
  next = replaceFlexible(
    next,
    "aligned with our nonprofit mission",
    "in operating our fan-engagement services",
  );
  next = replaceFlexible(next, LAST_UPDATED_FROM, LAST_UPDATED_TO);
  next = alignOfficialContactEmails(next);
  next = fillEmptyPrivacyContact(next);
  return next;
}

export function privacyCounselEffectiveDate(current: string | null): string | null {
  if (!current) return current;
  if (current.slice(0, 10) === PRIOR_PRIVACY_EFFECTIVE_DATE) {
    return PRIVACY_COUNSEL_EFFECTIVE_DATE;
  }
  return current;
}
