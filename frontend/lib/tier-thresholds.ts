import type { Tier, TierSlug } from "./data/types.ts";

/** Single source of truth after 0046. Badge gallery and Fan Home must match. */
export const TIER_MIN_POINTS = {
  bronze: 0,
  silver: 750,
  gold: 3500,
  platinum: 8000,
} as const satisfies Record<TierSlug, number>;

export const FALLBACK_TIERS: Tier[] = [
  { slug: "bronze",   display_name: "Bronze",    min_points: TIER_MIN_POINTS.bronze,   perks: ["Welcome badge", "Access to fan home"], sort_order: 1 },
  { slug: "silver",   display_name: "Silver",    min_points: TIER_MIN_POINTS.silver,   perks: ["Priority digital drops", "Leaderboard boost"], sort_order: 2 },
  { slug: "gold",     display_name: "Gold",      min_points: TIER_MIN_POINTS.gold,     perks: ["Exclusive digital unlocks", "Early event RSVPs"], sort_order: 3 },
  { slug: "platinum", display_name: "Platinum",  min_points: TIER_MIN_POINTS.platinum, perks: ["All-access digital catalog", "Priority event RSVPs"], sort_order: 4 },
];

const TIER_SLUGS_DESC = ["platinum", "gold", "silver", "bronze"] as const satisfies readonly TierSlug[];

export function formatPtsShort(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function isTierSlug(value: string): value is TierSlug {
  return value in TIER_MIN_POINTS;
}

export function isTierUnlocked(totalPoints: number, minPoints: number): boolean {
  return totalPoints >= minPoints;
}

/** Force every known slug onto the 750 / 3,500 / 8,000 ladder — DB drift cannot win. */
export function withCanonicalThresholds(tiers: Tier[]): Tier[] {
  return tiers.map((tier) =>
    isTierSlug(tier.slug)
      ? { ...tier, min_points: TIER_MIN_POINTS[tier.slug] }
      : tier,
  );
}

export function currentTierFromPoints(totalPoints: number): TierSlug {
  for (const slug of TIER_SLUGS_DESC) {
    if (isTierUnlocked(totalPoints, TIER_MIN_POINTS[slug])) return slug;
  }
  return "bronze";
}

export type TierJourneyRow = Tier & {
  unlocked: boolean;
  isCurrent: boolean;
  lockLabel: string;
};

/**
 * Lock/unlock + current-tier highlight for Fan Home and /rewards.
 * `totalPoints === null` means KPIs were unavailable — nothing unlocks.
 */
export function tierJourneyState(
  totalPoints: number | null,
  tiers: Tier[] = FALLBACK_TIERS,
  fallbackCurrent?: TierSlug,
): TierJourneyRow[] {
  const ladder = withCanonicalThresholds(tiers.length ? tiers : FALLBACK_TIERS);
  const current =
    totalPoints == null
      ? (fallbackCurrent ?? "bronze")
      : currentTierFromPoints(totalPoints);
  return ladder.map((tier) => {
    const unlocked = totalPoints != null && isTierUnlocked(totalPoints, tier.min_points);
    return {
      ...tier,
      unlocked,
      isCurrent: tier.slug === current,
      lockLabel: unlocked ? "Unlocked" : `${formatPtsShort(tier.min_points)} pts`,
    };
  });
}

export function tierBadgeSlugToTier(slug: string): TierSlug | null {
  const stripped = slug.replace(/^tier-/, "");
  return isTierSlug(stripped) ? stripped : null;
}

export function tierBadgeEarned(opts: {
  slug: string;
  alreadyEarned: boolean;
  totalPoints: number;
}): boolean {
  if (opts.alreadyEarned) return true;
  const tier = tierBadgeSlugToTier(opts.slug);
  if (!tier) return false;
  return isTierUnlocked(opts.totalPoints, TIER_MIN_POINTS[tier]);
}

export function tierBadgeDescription(slug: string, minPoints: number): string | null {
  switch (slug) {
    case "tier-silver":
      return `Crossed into Silver — ${formatPtsShort(minPoints)} pts.`;
    case "tier-gold":
      return `Reached Gold — ${formatPtsShort(minPoints)} pts. Serious fan energy.`;
    case "tier-platinum":
      return `Platinum unlocked — ${formatPtsShort(minPoints)} pts. Elite status.`;
    default:
      return null;
  }
}

export function pointsToGold(totalPoints: number): number {
  return Math.max(0, TIER_MIN_POINTS.gold - totalPoints);
}
