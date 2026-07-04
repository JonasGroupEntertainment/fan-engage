import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Award points to a fan — the single authoritative function for all
 * point grants in the platform.
 *
 * Writes to three places atomically (best-effort):
 *   1. points_ledger          — immutable audit trail, one row per event
 *   2. fans.total_points      — legacy denormalised total (still read by
 *                               some admin/analytics queries)
 *   3. fan_community_memberships.total_points — the UI source of truth
 *                               read by getCurrentFanKpis() and shown on
 *                               Fan Home, Rewards, and tier progress
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

  // 1. Ledger entry (audit trail)
  await admin.from("points_ledger").insert({
    fan_id: fanId,
    delta,
    source,
    community_id: communityId,
    ...(sourceRef ? { source_ref: sourceRef } : {}),
    ...(note ? { note } : {}),
  });

  // 2. fans.total_points (legacy denormalised column)
  const { data: fanRow } = await admin
    .from("fans")
    .select("total_points")
    .eq("id", fanId)
    .maybeSingle();
  await admin
    .from("fans")
    .update({ total_points: ((fanRow?.total_points as number) ?? 0) + delta })
    .eq("id", fanId);

  // 3. fan_community_memberships.total_points (UI source of truth)
  const { data: membership } = await admin
    .from("fan_community_memberships")
    .select("total_points")
    .eq("fan_id", fanId)
    .eq("community_id", communityId)
    .maybeSingle();

  if (membership) {
    await admin
      .from("fan_community_memberships")
      .update({
        total_points: ((membership.total_points as number) ?? 0) + delta,
      })
      .eq("fan_id", fanId)
      .eq("community_id", communityId);
  }
}
