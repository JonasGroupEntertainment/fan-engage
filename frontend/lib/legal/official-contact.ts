/**
 * Official public contact for Fan Engage Pro.
 * Locked by product owner Raymond Boyd + Fan Engage ops: one address
 * on the footer, legal pages, and support/help surfaces.
 */
export const OFFICIAL_CONTACT_EMAIL = "raymond@jonasgroup.com";

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
  "support@fanengagepro.com",
  "privacy@fanengage.app",
  "legal@fanengage.app",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function alignOfficialContactEmails(content: string): string {
  let next = content;
  for (const retired of RETIRED_PUBLIC_CONTACT_EMAILS) {
    next = next.replace(
      new RegExp(escapeRegExp(retired), "gi"),
      OFFICIAL_CONTACT_MD_LINK,
    );
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
