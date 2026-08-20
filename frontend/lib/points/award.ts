import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Award points to a fan — the single authoritative function for all
 * point grants in the platform.
 *
 * Delegates to apply_points_award(): ledger is the source of truth,
 * Founding Fan 1.5× is applied there, and denorm totals are synced.
 *
 * Pass the admin client so this works in server actions, API routes, and
 * cron jobs alike.
 *
 * Multi-tenancy: callers should pass communityId explicitly. When omitted,
 * we resolve the fan's community from their memberships — if they belong
 * to exactly one community that's unambiguous; otherwise we fall back to
 * "raelynn" (the original single-tenant default) so legacy behavior is
 * preserved. The resolved community is stamped on the ledger row so every
 * point event is attributable to a community.
 */
export async function awardPoints(
  admin: SupabaseClient,
  {
    fanId,
    delta,
    source,
    sourceRef,
    note,
    communityId,
  }: {
    fanId: string;
    delta: number;
    source: string;
    sourceRef?: string;
    note?: string;
    communityId?: string;
  },
): Promise<void> {
  if (!communityId) {
    const { data: memberships } = await admin
      .from("fan_community_memberships")
      .select("community_id")
      .eq("fan_id", fanId)
      .limit(2);
    communityId =
      memberships && memberships.length === 1
        ? (memberships[0].community_id as string)
        : "raelynn";
  }

  // Single SQL writer: ledger insert + Founding Fan 1.5× + denorm sync.
  // Clients cannot call this RPC (service_role only).
  const { error } = await admin.rpc("apply_points_award", {
    p_fan_id: fanId,
    p_base_delta: delta,
    p_source: source,
    p_source_ref: sourceRef ?? null,
    p_community_id: communityId,
    p_note: note ?? null,
  });

  if (error) {
    throw new Error(`apply_points_award failed: ${error.message}`);
  }
}
