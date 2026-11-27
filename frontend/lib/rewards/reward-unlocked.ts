/**
 * Which reward, if any, an award of points has just put within reach.
 * Pure: no "@/" imports, so plain `node --test` can load it.
 */

export type UnlockableReward = {
  id: string;
  title: string;
  point_cost: number;
  stock?: number | null;
  requires_tier?: string | null;
  drops_at?: string | null;
  expires_at?: string | null;
};

/** Sources that never trigger the notice. A brand new fan has enough to read already. */
const QUIET_SOURCES: readonly string[] = ["signup_bonus"];

export function isQuietAwardSource(source: string): boolean {
  return QUIET_SOURCES.includes(source);
}

function isOpenNow(reward: UnlockableReward, now: Date): boolean {
  if (reward.requires_tier) return false;
  if (typeof reward.stock === "number" && reward.stock <= 0) return false;
  if (reward.drops_at && new Date(reward.drops_at).getTime() > now.getTime()) return false;
  if (reward.expires_at && new Date(reward.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

/**
 * The most valuable reward whose price the balance has just crossed:
 * out of reach before the award, within reach after it. Rewards that need
 * a paid tier, are out of stock, not yet open or already closed are left
 * out, so the notice never names something the fan cannot claim.
 */
export function pickUnlockedReward(input: {
  balanceBefore: number;
  balanceAfter: number;
  rewards: ReadonlyArray<UnlockableReward>;
  now?: Date;
}): UnlockableReward | null {
  const { balanceBefore, balanceAfter } = input;
  if (!Number.isFinite(balanceBefore) || !Number.isFinite(balanceAfter)) return null;
  if (balanceAfter <= balanceBefore) return null;
  const now = input.now ?? new Date();
  const crossed = input.rewards.filter(
    (reward) =>
      Number.isFinite(reward.point_cost) &&
      reward.point_cost > 0 &&
      reward.point_cost > balanceBefore &&
      reward.point_cost <= balanceAfter &&
      isOpenNow(reward, now),
  );
  if (crossed.length === 0) return null;
  return crossed.reduce((best, reward) => (reward.point_cost > best.point_cost ? reward : best));
}

export function rewardUnlockedCopy(rewardTitle: string): { title: string; body: string } {
  return {
    title: `You have enough points for ${rewardTitle}`,
    body: "Open Rewards to claim it whenever you like. Your points stay yours until you do.",
  };
}

/** One notice per fan, per reward, per day. */
export function rewardUnlockedDedupRef(rewardId: string, now: Date): string {
  return `${rewardId}:${now.toISOString().slice(0, 10)}`;
}
