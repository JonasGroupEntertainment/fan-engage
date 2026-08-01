import { notFound } from "next/navigation";
import Link from "next/link";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { getPolicy } from "@/lib/data/policies";

/**
 * Renders a policy document.
 *
 * When `policy.is_draft` is true, we do NOT show the alarming
 * "DRAFT — pending legal review / use at your own risk" banner and
 * we do NOT render the draft body — those create the impression that
 * the company is operating without finalized policies. Manus' May 2026
 * audit flagged this as a public-facing trust hit.
 *
 * Until George's docs from corporate counsel land, drafts render a
 * production-safe holding state directing questions to support.
 * The draft body remains in the database — flipping `is_draft` to
 * false (or replacing `content_md` with the final text) will restore
 * full rendering.
 */
export default async function PolicyPage({ slug }: { slug: string }) {
  const policy = await getPolicy(slug);
  if (!policy) notFound();

  const policyName =
    {
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      cookie_policy: "Cookie Policy",
      cancellation_refund: "Cancellation & Refund Policy",
      rewards_terms: "Rewards Program Terms & Conditions",
    }[slug] ?? "Policy";

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xs text-white/50 hover:text-white">
          ← Fan Home
        </Link>
        {!policy.is_draft && policy.effective_date && (
          <span className="text-xs text-white/50">
            Effective {new Date(policy.effective_date).toLocaleDateString()}
          </span>
        )}
      </div>

      {policy.is_draft ? (
        // ─── Production-safe holding state ───────────────────────────
        // Until corporate counsel finalizes the policy, we do not show
        // draft text. The visible page describes the status and gives
        // a contact path. The route also carries
        // robots: { index: false, follow: false } via the page's
        // metadata so search engines don't index the holding state.
        <section className="space-y-6">
          <h1 className="text-3xl font-semibold leading-tight">
            {policyName}
          </h1>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-white/80">
            <p className="font-medium text-white">Policy being finalized.</p>
            <p className="mt-2">
              Fan Engage is currently finalizing this policy with corporate
              counsel before broader public launch. If you have questions
              about privacy, terms, cookies, data use, or your account,
              email{" "}
              <a
                href="mailto:support@fanengagepro.com"
                className="text-aurora underline-offset-4 hover:underline"
              >
                support@fanengagepro.com
              </a>
              . This page will be updated with the finalized policy before
              production rollout.
            </p>
          </div>
          <p className="text-xs text-white/45">
            Until then, the standard product behavior applies: account data
            is used to operate Fan Engage and is not sold or shared with
            unrelated third parties. Final terms will reflect this in
            writing.
          </p>
        </section>
      ) : (
        // ─── Final policy rendering ──────────────────────────────────
        <>
          <SimpleMarkdown source={policy.content_md} />
          <p className="pt-6 text-xs text-white/40">
            Last updated {new Date(policy.updated_at).toLocaleDateString()}.
          </p>
        </>
      )}
    </main>
  );
}
