/**
 * Entity correction for Terms of Use only.
 *
 * Fan Engage Pro LLC is a Colorado LLC (CO reg #20261702886). This helper
 * rewrites only the entity phrase so /terms and signup consent stay
 * accurate even when the stored row still says a North Carolina LLC.
 * Privacy and other policies pass through unchanged.
 *
 * Governing law and the arbitration place are North Carolina. Counsel set
 * governing law there. This helper does not rewrite either sentence.
 * applyItem4PolicyCopy maps a stored Colorado governing-law or arbitration
 * sentence back to North Carolina on terms, rewards terms, and cancellation.
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
