import {
  FALLBACK_TIERS,
  formatPtsShort,
  withCanonicalThresholds,
} from "../tier-thresholds.ts";
import type { Tier, TierSlug } from "../data/types.ts";

/**
 * "Progress at action" — the payload a server action returns right after a
 * fan earns points, and the one-line copy the toast renders from it.
 *
 * Tier progress follows LIFETIME points (0085), never the spendable balance,
 * so redeeming a reward can never make the "to Gold" number go up again.
 */
export interface NextTier {
  slug: TierSlug;
  name: string;
  pointsToGo: number;
}

export interface PointsProgress {
  /** Points this action just earned. 0 when a cap/dedupe swallowed it. */
  pointsAwarded: number;
  /** fans.lifetime_points after the action. */
  lifetimePoints: number;
  /** Next tier up, or null at the top of the ladder. */
  nextTier: NextTier | null;
}

/**
 * Next tier above `lifetimePoints`, with the gap. Pure. Uses the canonical
 * 750 / 3,500 / 8,000 ladder regardless of what the DB `tiers` rows say.
 */
export function nextTierProgress(
  lifetimePoints: number,
  tiers: Tier[] = FALLBACK_TIERS,
): NextTier | null {
  const pts = Number.isFinite(lifetimePoints) ? Math.max(0, lifetimePoints) : 0;
  const ladder = withCanonicalThresholds(tiers.length ? tiers : FALLBACK_TIERS)
    .slice()
    .sort((a, b) => a.min_points - b.min_points);
  const next = ladder.find((t) => t.min_points > pts);
  if (!next) return null;
  return {
    slug: next.slug,
    name: next.display_name,
    pointsToGo: next.min_points - pts,
  };
}

/** Name of the tier the fan currently holds, from lifetime points. */
export function currentTierName(
  lifetimePoints: number,
  tiers: Tier[] = FALLBACK_TIERS,
): string {
  const pts = Number.isFinite(lifetimePoints) ? Math.max(0, lifetimePoints) : 0;
  const ladder = withCanonicalThresholds(tiers.length ? tiers : FALLBACK_TIERS)
    .slice()
    .sort((a, b) => b.min_points - a.min_points);
  return (ladder.find((t) => t.min_points <= pts) ?? ladder[ladder.length - 1]).display_name;
}

/** Assemble the action return payload from before/after lifetime readings. */
export function pointsProgress(
  lifetimeBefore: number,
  lifetimeAfter: number,
  tiers: Tier[] = FALLBACK_TIERS,
): PointsProgress {
  const after = Math.max(lifetimeAfter, lifetimeBefore, 0);
  return {
    pointsAwarded: Math.max(0, after - Math.max(lifetimeBefore, 0)),
    lifetimePoints: after,
    nextTier: nextTierProgress(after, tiers),
  };
}

/**
 * Toast copy. Examples:
 *   "+10 pts · 1,569 to Gold"
 *   "+10 pts · You're Platinum"
 * Returns null when nothing was earned, so callers can skip the toast
 * instead of celebrating a capped action.
 */
export function formatPointsToast(p: PointsProgress | null | undefined): string | null {
  if (!p || p.pointsAwarded <= 0) return null;
  const earned = `+${formatPtsShort(p.pointsAwarded)} pts`;
  if (p.nextTier) {
    return `${earned} · ${formatPtsShort(p.nextTier.pointsToGo)} to ${p.nextTier.name}`;
  }
  return `${earned} · You're ${currentTierName(p.lifetimePoints)}`;
}
