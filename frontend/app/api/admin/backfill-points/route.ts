import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-time backfill: sync fan_community_memberships.total_points from the
 * points_ledger for every fan/community pair.
 *
 * Protected by CRON_SECRET so it can't be triggered by random visitors.
 * Safe to run multiple times — it overwrites with the ledger sum each time.
 *
 * Invoke: POST /api/admin/backfill-points
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Sum all ledger deltas per fan
  const { data: ledgerRows, error: ledgerErr } = await admin
    .from("points_ledger")
    .select("fan_id, delta");

  if (ledgerErr) {
    console.error("[backfill-points] ledger read failed:", ledgerErr.message);
    return NextResponse.json({ error: "Failed to read ledger" }, { status: 500 });
  }

  // Aggregate: fan_id → total
  const totals = new Map<string, number>();
  for (const row of ledgerRows ?? []) {
    const fanId = row.fan_id as string;
    totals.set(fanId, (totals.get(fanId) ?? 0) + (row.delta as number));
  }

  // 2. Fetch all memberships so we know which (fan_id, community_id) rows exist
  const { data: memberships, error: memErr } = await admin
    .from("fan_community_memberships")
    .select("fan_id, community_id, total_points");

  if (memErr) {
    console.error("[backfill-points] memberships read failed:", memErr.message);
    return NextResponse.json({ error: "Failed to read memberships" }, { status: 500 });
  }

  // 3. Update each membership whose points don't match the ledger sum
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const mem of memberships ?? []) {
    const fanId = mem.fan_id as string;
    const communityId = mem.community_id as string;
    const ledgerTotal = totals.get(fanId) ?? 0;
    const currentTotal = (mem.total_points as number) ?? 0;

    if (ledgerTotal === currentTotal) {
      skipped++;
      continue;
    }

    const { error: updateErr } = await admin
      .from("fan_community_memberships")
      .update({ total_points: ledgerTotal })
      .eq("fan_id", fanId)
      .eq("community_id", communityId);

    if (updateErr) {
      console.error(`[backfill-points] update failed for ${fanId}/${communityId}:`, updateErr.message);
      errors.push(`${fanId}/${communityId}`);
    } else {
      updated++;
    }
  }

  // 4. Also sync fans.total_points from ledger (belt-and-suspenders)
  let fansUpdated = 0;
  for (const [fanId, ledgerTotal] of totals.entries()) {
    const { error: fanErr } = await admin
      .from("fans")
      .update({ total_points: ledgerTotal })
      .eq("id", fanId);
    if (!fanErr) fansUpdated++;
  }

  return NextResponse.json({
    ok: true,
    memberships_updated: updated,
    memberships_skipped: skipped,
    fans_synced: fansUpdated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
