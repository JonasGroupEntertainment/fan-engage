/**
 * Official public contact for Fan Engage Pro.
 * One address on the footer, legal pages, and support/help surfaces:
 * support@fanengagepro.com. Help already used this inbox.
 *
 * raymond@jonasgroup.com is a staff inbox (super-admin grant in
 * 0044_super_admin_grants.sql). It is not a public support address.
 * The DMCA agent (bhamilton@joneskeller.com) and the rewards-ops
 * address carla@jonasgroup.com are not rewritten here.
 */
export const OFFICIAL_CONTACT_EMAIL = "support@fanengagepro.com";

export const OFFICIAL_CONTACT_MAILTO = `mailto:${OFFICIAL_CONTACT_EMAIL}`;

/** Markdown link so policy bodies rendered by SimpleMarkdown get a real mailto. */
export const OFFICIAL_CONTACT_MD_LINK = `[${OFFICIAL_CONTACT_EMAIL}](${OFFICIAL_CONTACT_MAILTO})`;

/**
 * Mismatched public inboxes that must not appear on contact/support surfaces.
 * Transactional senders (no-reply@) and the designated DMCA agent are not in
 * this list.
 */
export const RETIRED_PUBLIC_CONTACT_EMAILS = [
  "contact@fanengagepro.com",
  "contact@fep.com",
  "support@fanengage.app",
  "privacy@fanengage.app",
  "legal@fanengage.app",
  "raymond@jonasgroup.com",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function alignOfficialContactEmails(content: string): string {
  let next = content;
  for (const retired of RETIRED_PUBLIC_CONTACT_EMAILS) {
    const escaped = escapeRegExp(retired);
    // Replace a whole markdown link first so the mailto and the label
    // are not each wrapped again.
    next = next.replace(
      new RegExp(`\\[${escaped}\\]\\(mailto:${escaped}\\)`, "gi"),
      OFFICIAL_CONTACT_MD_LINK,
    );
    next = next.replace(new RegExp(escaped, "gi"), OFFICIAL_CONTACT_MD_LINK);
  }
  return next;
}

/**
 * Terms tell fans to contact customer support but publish no address.
 * Insert the official inbox on that sentence only.
 */
export function applyTermsSupportContact(slug: string, content: string): string {
  if (slug !== "terms") return content;
  return content.replaceAll(
    "contacting FEP customer support team",
    `contacting FEP customer support at ${OFFICIAL_CONTACT_MD_LINK}`,
  );
}
