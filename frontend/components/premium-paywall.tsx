import Link from "next/link";

interface PremiumPaywallProps {
  /** What the user is trying to see. Used in the headline copy. */
  feature: string;
  /** Optional longer description of what they'll get. */
  description?: string;
  /** Community slug — paywall links go to /premium scoped to this community. */
  communityId?: string;
  /** Community accent colors. Falls back to the default aurora→ember gradient. */
  accentFrom?: string | null;
  accentTo?: string | null;
  /** Reason from canAccess() — drives the CTA text and copy. */
  reason?: "signed-out" | "needs-premium" | "needs-founder";
  /** Compact variant for inline use (e.g. inside a post card). */
  compact?: boolean;
}

/**
 * The shared locked-state UI. Whenever a piece of content is gated behind
 * Premium or Founder-only access, wrap it (or replace it) with this component
 * so every paywall across the app looks and behaves the same.
 *
 * The component is purely presentational — it assumes the caller already
 * decided the viewer can't see the content. Use canAccess() from
 * lib/entitlements.ts to make that call upstream.
 */
export default function PremiumPaywall({
  feature,
  description,
  communityId,
  accentFrom,
  accentTo,
  reason = "needs-premium",
  compact = false,
}: PremiumPaywallProps) {
  const from = accentFrom ?? "#7c3aed";
  const to = accentTo ?? "#fb923c";

  const premiumPath = `/premium${communityId ? `?c=${communityId}` : ""}`;
  const signupHref = communityId
    ? `/signup?ref=${encodeURIComponent(communityId)}&next=${encodeURIComponent(premiumPath)}`
    : `/signup?next=${encodeURIComponent(premiumPath)}`;
  const loginHref = `/login?next=${encodeURIComponent(premiumPath)}`;
  // Soft-launch guests hit gated content before they have an account —
  // primary CTA is Create account; Sign in is secondary for returners.
  const ctaHref = reason === "signed-out" ? signupHref : "/premium";

  let ctaLabel: string;
  let featureCopy: string;

  if (reason === "signed-out") {
    ctaLabel = "Create account to unlock";
    featureCopy = `${feature} is for Premium fans`;
  } else if (reason === "needs-founder") {
    ctaLabel = "Become a Founding Fan";
    featureCopy = `${feature} is for Founders only`;
  } else {
    // needs-premium
    ctaLabel = "Upgrade to Premium — $10/mo";
    featureCopy = `${feature} is for Premium fans`;
  }

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm"
        style={{ borderColor: `${from}33` }}
      >
        <span
          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-base"
          style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          {reason === "needs-founder" ? "👑" : "🔒"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{featureCopy}</p>
          {description && (
            <p className="truncate text-xs text-white/55">{description}</p>
          )}
        </div>
        <Link
          href={ctaHref}
          className="flex-none rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-glass transition hover:brightness-110"
          style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${to})` }}
        >
          {reason === "signed-out" ? "Join" : reason === "needs-founder" ? "Founders" : "Upgrade"}
        </Link>
      </div>
    );
  }

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-6"
      style={{ borderColor: `${from}33`, backgroundImage: `linear-gradient(135deg, ${from}08, ${to}08)` }}
    >
      <div className="relative z-10 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white/90">
              {reason === "needs-founder"
                ? "Paid Premium only — separate from the free Founding Fan badge"
                : reason === "signed-out"
                  ? "Join to unlock Premium"
                  : "Upgrade to Premium"}
            </p>
            <h3 className="mt-2 text-lg font-bold text-white">{featureCopy}</h3>
            {description && (
              <p className="mt-2 text-sm text-white/75">{description}</p>
            )}
          </div>
          <span className="text-3xl flex-none">
            {reason === "needs-founder" ? "👑" : "🔒"}
          </span>
        </div>

        <div className="space-y-2">
          {reason === "needs-founder" ? (
            <>
              <p className="text-xs text-white/60">
                Be one of the first 100 fans to support this artist directly. Founders get:
              </p>
              <ul className="space-y-1 text-xs text-white/70">
                <li>✓ Exclusive founder-only posts & events</li>
                <li>✓ Direct support of your favorite artist</li>
                <li>✓ Lifetime founder status & badge</li>
              </ul>
            </>
          ) : (
            <>
              <p className="text-xs text-white/60">
                Premium fans get exclusive access to:
              </p>
              <ul className="space-y-1 text-xs text-white/70">
                <li>✓ Backstage posts</li>
                <li>✓ Early event RSVPs & listening parties</li>
                <li>✓ Exclusive polls & challenges</li>
              </ul>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={ctaHref}
            className="inline-block rounded-full px-5 py-2 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
            style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${to})` }}
          >
            {ctaLabel}
          </Link>
          {reason === "signed-out" && (
            <Link
              href={loginHref}
              className="text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
            >
              Already a fan? Sign in
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
