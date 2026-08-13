/**
 * Per-fan reward recommendations.
 *
 * Hands off the heavy lifting to the recommend_rewards_for_fan() Postgres
 * function (migration 0030) and adds:
 *
 *   - A typed result interface.
 *   - Cold-start fallback for fans with zero past redemptions: pick the
 *     most-redeemed active reward in the community that the fan can
 *     afford and is tier-eligible for.
 *
 * Read-side function — no writes. Safe to call from a server component
 * on every page render.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { shouldListLaunchReward } from "@/lib/launch-catalog";

export interface RecommendedReward {
  reward_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  point_cost: number;
  requires_tier: string | null;
  /** Sum of (1 - cosine_distance) across past redemptions. null for cold-start. */
  affinity_score: number | null;
  /** Number of past redemptions the score was averaged over. 0 = cold start. */
  match_count: number;
  /** Why we surfaced this reward — used in the "Why this?" caption. */
  reason: "affinity" | "cold_start_popular" | "cold_start_cheapest";
}

export async function recommendReward(opts: {
  fanId: string;
  communityId: string;
}): Promise<RecommendedReward | null> {
  const admin = createAdminClient();

  // Path 1: affinity-based recommendation via the RPC.
  const { data, error } = await admin.rpc("recommend_rewards_for_fan", {
    p_fan_id: opts.fanId,
    p_community_id: opts.communityId,
    p_limit: 1,
  });

  if (error) {
    // Don't crash the page if recs fail. Log + fall back to cold start.
    console.error("[recs/rewards] RPC failed:", error.message);
  }

  const rows = (data ?? []) as Array<{
    reward_id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    point_cost: number;
    requires_tier: string | null;
    affinity_score: number;
    match_count: number;
  }>;

  const listed = rows.filter((row) =>
    shouldListLaunchReward(
      {
        title: row.title,
        community_id: opts.communityId,
        active: true,
      },
      { signedIn: true },
    ),
  );

  if (listed.length > 0) {
    const r = listed[0];
    return {
      reward_id: r.reward_id,
      title: r.title,
      description: r.description,
      image_url: r.image_url,
      point_cost: r.point_cost,
      requires_tier: r.requires_tier,
      affinity_score: r.affinity_score,
      match_count: r.match_count,
      reason: "affinity",
    };
  }

  // Path 2: cold-start fallback. Most-redeemed active reward in this
  // community that the fan can afford and is tier-eligible for.
  return coldStartReward(opts.fanId, opts.communityId);
}

async function coldStartReward(
  fanId: string,
  communityId: string,
): Promise<RecommendedReward | null> {
  const admin = createAdminClient();

  // 1. Fan's affordability + tier context.
  const [{ data: fan }, { data: ent }] = await Promise.all([
    admin
      .from("fans")
      .select("total_points")
      .eq("id", fanId)
      .maybeSingle(),
    admin
      .from("fan_community_memberships")
      .select("subscription_tier, is_founder")
      .eq("fan_id", fanId)
      .eq("community_id", communityId)
      .maybeSingle(),
  ]);

  const fanPoints = (fan?.total_points as number | null) ?? 0;
  const sub = (ent?.subscription_tier as string | null) ?? "free";
  const isPremium =
    sub === "premium" ||
    sub === "comped" ||
    sub === "past_due" ||
    ent?.is_founder === true;
  const isFounder = ent?.is_founder === true;

  // 2. Pull eligible rewards.
  const { data: rewards } = await admin
    .from("rewards_catalog")
    .select(
      "id, title, description, image_url, point_cost, requires_tier, sort_order, clip_url, in_app_only, active, community_id",
    )
    .eq("community_id", communityId)
    .eq("active", true)
    .lte("point_cost", fanPoints)
    .order("sort_order", { ascending: true });

  const eligible = ((rewards ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    point_cost: number;
    requires_tier: string | null;
    sort_order: number;
    clip_url: string | null;
    in_app_only: boolean;
    active: boolean;
    community_id: string | null;
  }>).filter((r) => {
    if (!shouldListLaunchReward(r, { signedIn: true })) return false;
    if (!r.requires_tier) return true;
    if (r.requires_tier === "premium") return isPremium;
    if (r.requires_tier === "founder-only") return isFounder;
    return false;
  });

  if (eligible.length === 0) return null;

  // 3. Rank by past-30-day redemption volume to surface the popular pick.
  const ids = eligible.map((r) => r.id);
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: redemptions } = await admin
    .from("reward_redemptions")
    .select("reward_id")
    .in("reward_id", ids)
    .gt("created_at", since)
    .in("status", ["pending", "fulfilled"]);

  const counts = new Map<string, number>();
  for (const row of (redemptions ?? []) as Array<{ reward_id: string }>) {
    counts.set(row.reward_id, (counts.get(row.reward_id) ?? 0) + 1);
  }

  // If anyone has redeemed anything in the last 30 days, pick the most popular.
  const sortedByPopularity = [...eligible].sort(
    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
  );
  const top = sortedByPopularity[0];

  // If popularity is all zeros (truly cold platform), pick the cheapest
  // reward — that's the easiest first redemption for a new fan.
  const reason: RecommendedReward["reason"] =
    (counts.get(top.id) ?? 0) > 0 ? "cold_start_popular" : "cold_start_cheapest";
  const pick =
    reason === "cold_start_cheapest"
      ? [...eligible].sort((a, b) => a.point_cost - b.point_cost)[0]
      : top;

  return {
    reward_id: pick.id,
    title: pick.title,
    description: pick.description,
    image_url: pick.image_url,
    point_cost: pick.point_cost,
    requires_tier: pick.requires_tier,
    affinity_score: null,
    match_count: 0,
    reason,
  };
}

/** Human-readable caption for the hero card "Why this?" line. */
export function reasonCopy(reward: RecommendedReward): string {
  switch (reward.reason) {
    case "affinity":
      return reward.match_count === 1
        ? "Based on a reward you redeemed before."
        : `Based on the ${reward.match_count} rewards you've redeemed.`;
    case "cold_start_popular":
      return "Popular with fans this month and within your points.";
    case "cold_start_cheapest":
      return "An easy first redemption — within your points and tier.";
  }
}
