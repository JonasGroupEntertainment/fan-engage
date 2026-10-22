import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { runDailyAnniversaryScan } from "@/lib/anniversaries/celebrate";

/**
 * Cron: GET /api/cron/anniversary-notifier
 *
 * Runs daily (vercel.json schedule). Looks for fan-artist follow rows
 * whose age today equals one of the milestone day-counts (30, 180, 365,
 * 730, 1095, 1825) and celebrates each one with:
 *   - Points award
 *   - points_ledger entry
 *   - Push notification (uses Phase 2 notify_drops bucket)
 *   - Append to fan_anniversary_log (dedupe-safe)
 *
 * Auth: requires CRON_SECRET in Authorization: Bearer header (matches
 * the existing FE cron auth pattern).
 *
 * Idempotent — safe to call manually mid-day for testing; rerunning
 * the same day is a no-op since the dedupe row already exists.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  return runCron(request, "anniversary-notifier", () => anniversaryNotifier());
}

async function anniversaryNotifier() {
  try {
    const result = await runDailyAnniversaryScan();
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch (err) {
    console.error("anniversary-notifier failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
