/**
 * "Your next step" on Fan Home: the one goal a fan is closest to.
 *
 * In order: a reward they already have the points for, the nearest reward
 * still ahead, then the next tier. It only ever names something the fan can
 * really get:
 *   - a reward has to belong to an artist community (a reward with no
 *     community cannot be redeemed today),
 *   - a reward limited to Premium or Founder members is left out for
 *     everyone. The database checks those against the exact subscription
 *     value, which is stricter than what this page can see (a comped or
 *     past-due member would be refused), so the card cannot promise them,
 *   - redeeming any reward is a Premium feature, so a fan without Premium
 *     is told that in the same breath as the reward.
 *
 * Reward progress uses the spendable balance. Tier progress uses lifetime
 * points, which never go down, so redeeming never moves a fan away from
 * their next tier.
 *
 * Pure rules, no React and no server imports, so `node --test` can load it.
 */
import { nextTierProgress } from "./points/progress.ts";
import { FALLBACK_TIERS, formatPtsShort, withCanonicalThresholds } from "./tier-thresholds.ts";
import type { Tier } from "./data/types.ts";

const FULL_PERCENT = 100;

export type NextStepReward = {
  id: string;
  title: string;
  point_cost: number;
  community_id: string | null;
  requires_tier: "premium" | "founder-only" | null;
  /** The fan has already redeemed this reward. */
  redeemed: boolean;
};

export type NextStepKind = "reward_ready" | "reward_ahead" | "tier_ahead";

export type NextStep = {
  kind: NextStepKind;
  /** Small label above the title. */
  eyebrow: string;
  /** The reward or tier the fan is working toward. */
  title: string;
  /** One or two short sentences. */
  line: string;
  /** Progress toward the goal, 0 to 100. */
  percent: number;
  href: string;
  cta: string;
};

export type NextStepInput = {
  /** Spendable balance, or null when it could not be read. */
  spendablePoints: number | null | undefined;
  /** Lifetime points, or null when they could not be read. */
  lifetimePoints: number | null | undefined;
  rewards: readonly NextStepReward[];
  /** Communities where the fan has Premium. */
  premiumCommunities: readonly string[];
  /** Where the tier ladder lives. */
  tiersHref: string;
  tiers?: Tier[];
};

/** Said whenever a fan without Premium is pointed at a reward. */
export const PREMIUM_REDEEM_NOTE = "Redeeming rewards is part of Premium.";

function pointsWord(n: number): string {
  return `${formatPtsShort(n)} more ${n === 1 ? "point" : "points"}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(FULL_PERCENT, Math.max(0, value)));
}

/** A reward this fan could redeem, given the points. */
function isOpenToFan(reward: NextStepReward): boolean {
  if (reward.redeemed) return false;
  if (!Number.isFinite(reward.point_cost) || reward.point_cost <= 0) return false;
  if (!reward.community_id) return false;
  // Tier-only rewards: see the note at the top of this file.
  if (reward.requires_tier) return false;
  return true;
}

function rewardStep(reward: NextStepReward, balance: number, hasPremium: boolean): NextStep {
  const href = `/artists/${reward.community_id}/rewards`;
  const premiumNote = hasPremium ? "" : ` ${PREMIUM_REDEEM_NOTE}`;
  if (reward.point_cost <= balance) {
    return {
      kind: "reward_ready",
      eyebrow: hasPremium ? "Ready to redeem" : "You have the points",
      title: reward.title,
      line: `You have enough points for ${reward.title}.${premiumNote}`,
      percent: FULL_PERCENT,
      href,
      cta: hasPremium ? "Redeem now" : "See how to redeem",
    };
  }
  return {
    kind: "reward_ahead",
    eyebrow: "Your next reward",
    title: reward.title,
    line: `${pointsWord(reward.point_cost - balance)} to ${reward.title}.${premiumNote}`,
    percent: clampPercent((balance / reward.point_cost) * FULL_PERCENT),
    href,
    cta: "See this reward",
  };
}

function tierStep(input: NextStepInput): NextStep | null {
  if (input.lifetimePoints === null || input.lifetimePoints === undefined) return null;
  const lifetime = Math.max(0, input.lifetimePoints);
  const next = nextTierProgress(lifetime, input.tiers ?? FALLBACK_TIERS);
  if (!next) return null;
  const ladder = withCanonicalThresholds(input.tiers?.length ? input.tiers : FALLBACK_TIERS);
  const nextMin = ladder.find((tier) => tier.slug === next.slug)?.min_points ?? lifetime + next.pointsToGo;
  const currentMin = Math.max(0, ...ladder.map((tier) => tier.min_points).filter((min) => min <= lifetime));
  const span = nextMin - currentMin;
  return {
    kind: "tier_ahead",
    eyebrow: "Your next tier",
    title: next.name,
    line: `${pointsWord(next.pointsToGo)} to ${next.name}.`,
    percent: span <= 0 ? 0 : clampPercent(((lifetime - currentMin) / span) * FULL_PERCENT),
    href: input.tiersHref,
    cta: "See the tiers",
  };
}

/**
 * The fan's next step, or null when nothing honest can be said (points
 * unknown, nothing to redeem and already at the top tier).
 */
export function pickNextStep(input: NextStepInput): NextStep | null {
  const balance = input.spendablePoints;
  if (balance !== null && balance !== undefined && Number.isFinite(balance)) {
    const safeBalance = Math.max(0, balance);
    const open = input.rewards.filter((reward) => isOpenToFan(reward));
    // The best reward already in reach, else the closest one still ahead.
    const ready = open
      .filter((reward) => reward.point_cost <= safeBalance)
      .sort((a, b) => b.point_cost - a.point_cost)[0];
    const ahead = open
      .filter((reward) => reward.point_cost > safeBalance)
      .sort((a, b) => a.point_cost - b.point_cost)[0];
    const reward = ready ?? ahead;
    if (reward && reward.community_id) {
      return rewardStep(reward, safeBalance, input.premiumCommunities.includes(reward.community_id));
    }
  }
  return tierStep(input);
}
