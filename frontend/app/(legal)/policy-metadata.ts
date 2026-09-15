import type { Metadata } from "next";
import { getPolicy, type PolicyPage } from "@/lib/data/policies";
import { policyDocumentTitle, policyRobots } from "@/lib/data/policy-seo";

/**
 * Draft or missing policies stay noindex. Published policies (`is_draft`
 * false) are allowed to be indexed so live legal pages can appear in search.
 */
export function policyMetadataFromRecord(
  policy: PolicyPage | null,
  fallbackTitle: string,
): Metadata {
  return {
    title: policyDocumentTitle(policy, fallbackTitle),
    robots: policyRobots(policy),
  };
}

export async function generatePolicyMetadata(
  slug: string,
  fallbackTitle: string,
): Promise<Metadata> {
  return policyMetadataFromRecord(await getPolicy(slug), fallbackTitle);
}
