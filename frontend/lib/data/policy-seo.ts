/** Minimal policy fields used for public robots/title metadata. */
export type PolicySeoRecord = {
  title?: string | null;
  is_draft: boolean;
} | null;

/** Missing and draft policies stay noindex; published policies may be indexed. */
export function policyRobots(policy: PolicySeoRecord): {
  index: boolean;
  follow: boolean;
} {
  if (!policy || policy.is_draft) {
    return { index: false, follow: false };
  }
  return { index: true, follow: true };
}

export function policyDocumentTitle(
  policy: PolicySeoRecord,
  fallbackTitle: string,
): string {
  const title = policy?.title?.trim();
  return title || fallbackTitle;
}
