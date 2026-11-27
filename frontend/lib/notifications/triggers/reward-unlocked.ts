import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { shouldListLaunchReward } from "@/lib/launch-catalog";
import {
  isQuietAwardSource,
  pickUnlockedReward,
  rewardUnlockedCopy,
  rewardUnlockedDedupRef,
  type UnlockableReward,
} from "@/lib/rewards/reward-unlocked";
import { sendNotification } from "../send";
import { inboxDedupKey } from "../inbox-mirror";

type CatalogRow = UnlockableReward & {
  active: boolean;
  clip_url: string | null;
  community_id: string | null;
};

/**
 * Tells a fan when an award has carried their balance across a reward's
 * price: "You have enough points for {reward}". Inbox and push only.
 * Called from awardPoints after the points are written. Never throws.
 */
export async function notifyRewardUnlocked(
  admin: SupabaseClient,
  opts: { fanId: string; communityId: string; written: number; source: string },
): Promise<void> {
  try {
    if (opts.written <= 0 || isQuietAwardSource(opts.source)) return;

    const { data: balance, error: balanceErr } = await admin.rpc("fan_ledger_balance", {
      p_fan_id: opts.fanId,
    });
    if (balanceErr || typeof balance !== "number") return;

    const { data: rows, error: rewardsErr } = await admin
      .from("rewards_catalog")
      .select("id, title, point_cost, stock, requires_tier, drops_at, expires_at, active, clip_url, community_id")
      .or(`community_id.eq.${opts.communityId},community_id.is.null`)
      .eq("active", true);
    if (rewardsErr) return;

    const listed = ((rows ?? []) as CatalogRow[]).filter((row) =>
      shouldListLaunchReward(row, { signedIn: true }),
    );
    const now = new Date();
    const reward = pickUnlockedReward({
      balanceBefore: balance - opts.written,
      balanceAfter: balance,
      rewards: listed,
      now,
    });
    if (!reward) return;

    const copy = rewardUnlockedCopy(reward.title);
    await sendNotification({
      fanId: opts.fanId,
      type: "redemption",
      channels: ["push"],
      payload: {
        title: copy.title,
        body: copy.body,
        url: `/artists/${opts.communityId}/rewards`,
        tag: `reward_unlocked:${reward.id}`,
      },
      inbox: {
        kind: "redemption_update",
        dedupKey: inboxDedupKey("reward_unlocked", rewardUnlockedDedupRef(reward.id, now)),
        body: copy.body,
        communityId: opts.communityId,
      },
    });
  } catch (err) {
    console.warn("notifyRewardUnlocked failed (non-blocking):", err);
  }
}

/**
 * Runs the notice after the response has been sent, so it never slows a
 * page, a check-in or a payment acknowledgement. Outside a request (where
 * there is no response to wait for) it runs straight away. Never throws.
 */
export function scheduleRewardUnlockedNotice(
  admin: SupabaseClient,
  opts: { fanId: string; communityId: string; written: number; source: string },
): void {
  const run = () => notifyRewardUnlocked(admin, opts);
  try {
    after(run);
  } catch {
    void run();
  }
}
