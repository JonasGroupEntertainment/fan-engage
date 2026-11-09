/**
 * Factual entity / governing-law / venue corrections for Terms of Use only.
 *
 * Live `policy_pages.slug = 'terms'` still stores North Carolina. Fan Engage
 * Pro LLC is a Colorado LLC (CO reg #20261702886). This helper rewrites only
 * the entity phrase so /terms and signup consent stay accurate even before
 * the matching SQL migration is applied. Privacy and other policies pass
 * through unchanged.
 *
 * Governing law stays "laws of the State of North Carolina". The arbitration
 * place stays North Carolina. Raymond left both for Kevin and counsel.
 * Do not rewrite either sentence here.
 *
 * Notices address (if present) is left as-is — Belmont, NC is an allowed
 * notices address; it is not the entity state.
 */
export const TERMS_ENTITY_FACT_REPLACEMENTS = [
  {
    from: "a North Carolina limited liability company",
    to: "a Colorado limited liability company",
  },
] as const;

export function applyTermsColoradoEntityFacts(
  slug: string,
  contentMd: string,
): string {
  if (slug !== "terms") return contentMd;
  let next = contentMd;
  for (const { from, to } of TERMS_ENTITY_FACT_REPLACEMENTS) {
    next = next.replaceAll(from, to);
  }
  return next;
}
