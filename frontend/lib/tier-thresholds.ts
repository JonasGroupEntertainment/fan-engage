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

export function formatPtsShort(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
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
