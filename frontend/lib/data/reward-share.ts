import { createAdminClient } from "@/lib/supabase/admin";
import { isRewardId, isRewardShareable, type ShareableRewardFields } from "@/lib/reward-share";

/** What the public reward share page and its picture show. */
export type ShareableReward = ShareableRewardFields & {
  description: string | null;
  point_cost: number;
};

const SHARE_COLUMNS =
  "id, community_id, title, description, point_cost, active, requires_tier, stock, drops_at, expires_at, clip_url";

/**
 * One reward for the public share page, or null when it does not exist or
 * may not be shown publicly (lib/reward-share.ts isRewardShareable).
 *
 * Read with the service role because the page is rendered with no visitor
 * session; the shareable check, not row level security, decides what a
 * visitor sees. A failed read is logged and treated as "not found".
 */
export async function getShareableReward(
  artistSlug: string,
  rewardId: string,
  now: Date = new Date(),
): Promise<ShareableReward | null> {
  if (!isRewardId(rewardId)) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("rewards_catalog")
      .select(SHARE_COLUMNS)
      .eq("id", rewardId)
      .eq("community_id", artistSlug)
      .maybeSingle();
    if (error) {
      console.error("getShareableReward: read failed", error.message);
      return null;
    }
    const reward = (data ?? null) as ShareableReward | null;
    return isRewardShareable(reward, { artistSlug, now }) ? reward : null;
  } catch (err) {
    console.error("getShareableReward: read failed", err);
    return null;
  }
}
