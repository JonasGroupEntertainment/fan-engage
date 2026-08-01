import Link from "next/link";

interface PremiumBadgeProps {
  /** True if the viewer has Premium-level access (premium/comped/past_due). */
  isPremium: boolean;
  /** True if they hold a Founder slot (overrides label + gives a gold style). */
  isFounder?: boolean;
  /** Founder number (1–100). Rendered in the tooltip. */
  founderNumber?: number | null;
  /** Community accent colors. Falls back to the brand gradient. */
  accentFrom?: string | null;
  accentTo?: string | null;
  /** If false, renders nothing. Convenience so callers can always mount it. */
  show?: boolean;
}

/**
 * Compact navbar indicator that says "you're in the club". Shows a star
 * for regular Premium, a crown for Founders. Clicks through to the
 * billing page so active subscribers have a fast path to manage their
 * plan.
 *
 * Does not render if isPremium is false — the caller can safely mount it
 * unconditionally.
 */
export default function PremiumBadge({
  isPremium,
  isFounder = false,
  founderNumber = null,
  accentFrom,
  accentTo,
  show = true,
}: PremiumBadgeProps) {
  if (!show || !isPremium) return null;

  const from = accentFrom ?? "#7c3aed";
  const to = accentTo ?? "#fb923c";

  const label = isFounder ? "Founder" : "Premium";
  const icon = isFounder ? "👑" : "⭐";
  const tooltip = isFounder
    ? `Founding Fan${founderNumber ? ` #${founderNumber}` : ""} — locked-in pricing for life`
    : "Premium fan — manage billing";

  return (
    <Link
      href="/account/billing"
      aria-label={tooltip}
      title={tooltip}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-glass transition hover:brightness-110"
      style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${to})` }}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
