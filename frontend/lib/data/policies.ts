import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PolicySlug =
  | "terms"
  | "privacy"
  | "cookie_policy"
  | "cancellation_refund"
  | "rewards_terms";

export interface PolicyPage {
  slug: PolicySlug | string;
  title: string;
  content_md: string;
  effective_date: string | null;
  is_draft: boolean;
  updated_at: string;
}

/** Missing and draft policies stay noindex; published policies may be indexed. */
export function policyRobots(policy: PolicyPage | null): {
  index: boolean;
  follow: boolean;
} {
  if (!policy || policy.is_draft) {
    return { index: false, follow: false };
  }
  return { index: true, follow: true };
}

export function policyDocumentTitle(
  policy: PolicyPage | null,
  fallbackTitle: string,
): string {
  const title = policy?.title?.trim();
  return title || fallbackTitle;
}

export async function getPolicy(slug: string): Promise<PolicyPage | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("policy_pages")
      .select("slug, title, content_md, effective_date, is_draft, updated_at")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return data as PolicyPage;
  } catch {
    return null;
  }
}

export async function listPolicies(): Promise<PolicyPage[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("policy_pages")
    .select("slug, title, content_md, effective_date, is_draft, updated_at")
    .order("slug");
  return (data ?? []) as PolicyPage[];
}
