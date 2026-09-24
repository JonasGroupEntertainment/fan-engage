import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyTermsColoradoEntityFacts } from "@/lib/legal/correct-terms-entity-facts";
import {
  alignOfficialContactEmails,
  applyTermsSupportContact,
} from "@/lib/legal/official-contact";
import {
  applyPrivacyCounselScrub,
  privacyCounselEffectiveDate,
} from "@/lib/legal/scrub-privacy-policy";

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

export async function getPolicy(slug: string): Promise<PolicyPage | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("policy_pages")
      .select("slug, title, content_md, effective_date, is_draft, updated_at")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return applyPublishedPolicyFacts(data as PolicyPage);
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
  return ((data ?? []) as PolicyPage[]).map(applyPublishedPolicyFacts);
}

function applyPublishedPolicyFacts(policy: PolicyPage): PolicyPage {
  let contentMd = alignOfficialContactEmails(policy.content_md);
  contentMd = applyTermsColoradoEntityFacts(policy.slug, contentMd);
  contentMd = applyTermsSupportContact(policy.slug, contentMd);
  let effectiveDate = policy.effective_date;
  if (policy.slug === "privacy") {
    contentMd = applyPrivacyCounselScrub(contentMd);
    effectiveDate = privacyCounselEffectiveDate(effectiveDate);
  }
  return {
    ...policy,
    content_md: contentMd,
    effective_date: effectiveDate,
  };
}
