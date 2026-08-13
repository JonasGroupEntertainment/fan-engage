import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RewardRow {
  id: string;
  community_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  point_cost: number;
  kind: "merch_discount" | "voice_note" | "video_shoutout" | "early_access" | "custom" | "experience";
  stock: number | null;
  active: boolean;
  sort_order: number;
  requires_tier: "premium" | "founder-only" | null;
  is_drop: boolean;
  drops_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RedemptionRow {
  id: string;
  fan_id: string;
  reward_id: string;
  community_id: string | null;
  point_cost: number;
  status: "pending" | "fulfilled" | "cancelled";
  delivery_details: string | null;
  fulfillment_note: string | null;
  created_at: string;
  fulfilled_at: string | null;
  cancelled_at: string | null;
}

export interface RedemptionWithReward extends RedemptionRow {
  reward: RewardRow;
}

/**
 * List active rewards for a community (including globals where community_id is null),
 * sorted by sort_order.
 */
export async function listRewardsForCommunity(communityId: string): Promise<RewardRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("rewards_catalog")
      .select("*")
      .or(`community_id.eq.${communityId},community_id.is.null`)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    return (data ?? []) as RewardRow[];
  } catch {
    return [];
  }
}

/**
 * List a fan's redemption history, newest first.
 */
export async function listMyRedemptions(fanId: string): Promise<RedemptionWithReward[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("reward_redemptions")
      .select(
        `
        id, fan_id, reward_id, community_id, point_cost, status,
        delivery_details, fulfillment_note, created_at, fulfilled_at, cancelled_at,
        reward:rewards_catalog(*)
        `
      )
      .eq("fan_id", fanId)
      .order("created_at", { ascending: false })
      .limit(50);
    // Supabase types the joined `reward` as an array by default, but it's
    // a to-one relation (reward_id → rewards_catalog.id). Normalise via
    // unknown cast since we know the shape.
    const rows = (data ?? []) as unknown as Array<
      Omit<RedemptionWithReward, "reward"> & { reward: RewardRow | RewardRow[] }
    >;
    return rows.map((r) => ({
      ...r,
      reward: Array.isArray(r.reward) ? r.reward[0] : r.reward,
    })) as RedemptionWithReward[];
  } catch {
    return [];
  }
}

/**
 * Admin view: list pending redemptions for a community, with reward details.
 */
export async function listPendingRedemptions(communityId: string): Promise<RedemptionWithReward[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("reward_redemptions")
      .select(
        `
        id, fan_id, reward_id, community_id, point_cost, status,
        delivery_details, fulfillment_note, created_at, fulfilled_at, cancelled_at,
        reward:rewards_catalog(*)
        `
      )
      .eq("community_id", communityId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    // Supabase types the joined `reward` as an array by default, but it's
    // a to-one relation (reward_id → rewards_catalog.id). Normalise via
    // unknown cast since we know the shape.
    const rows = (data ?? []) as unknown as Array<
      Omit<RedemptionWithReward, "reward"> & { reward: RewardRow | RewardRow[] }
    >;
    return rows.map((r) => ({
      ...r,
      reward: Array.isArray(r.reward) ? r.reward[0] : r.reward,
    })) as RedemptionWithReward[];
  } catch {
    return [];
  }
}

/**
 * Admin view: count of pending redemptions in a community.
 */
export async function countPendingRedemptions(communityId: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("reward_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("status", "pending");
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Invoke the redeem_reward RPC as the signed-in session user only.
 * Callers cannot supply another fan id (A-P0-2).
 * Returns { ok, redemptionId?, error? }
 */
export async function redeemReward({
  rewardId,
  deliveryDetails,
}: {
  rewardId: string;
  deliveryDetails?: string;
}): Promise<{ ok: boolean; redemptionId?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "Not signed in" };
    }

    const { data, error } = await supabase.rpc("redeem_reward", {
      p_fan_id: user.id,
      p_reward_id: rewardId,
      p_delivery_details: deliveryDetails ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, redemptionId: data as string };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
