import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/compute-optimal-hours
 *
 * AI #19: Smart reminder timing.
 *
 * Scheduled nightly at 03:30 UTC (before the weekly digest's first
 * hourly tick on Sundays). Calls compute_optimal_notification_hours()
 * which returns each active fan's peak posting hour, then writes the
 * result to fans.optimal_notification_hour. Fans below the min-events
 * threshold (5 posts in 90 days) are skipped — they retain whatever
 * value was previously written, or NULL if never computed. NULL fans
 * receive their digest at 09:00 UTC via the fallback in
 * list_digest_recipients_at_hour.
 *
 * Cost: zero AI tokens (pure SQL aggregation). Updates ≤ count(distinct
 * active fans), runs in seconds even at 50k fans.
 */
export async function GET(request: Request) {
  return runCron(request, "compute-optimal-hours", () => computeOptimalHours());
}

async function computeOptimalHours() {
  const started = Date.now();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc(
    "compute_optimal_notification_hours",
    { p_min_events: 5, p_lookback_days: 90 },
  );
  if (error) {
    return NextResponse.json(
      { error: `compute_optimal_notification_hours failed: ${error.message}` },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as Array<{
    fan_id: string;
    optimal_hour: number;
    event_count: number;
  }>;

  let updated = 0;
  let errors = 0;
  const errorSamples: Array<{ fan_id: string; error: string }> = [];

  for (const r of rows) {
    const { error: updErr } = await admin
      .from("fans")
      .update({ optimal_notification_hour: r.optimal_hour })
      .eq("id", r.fan_id);
    if (updErr) {
      errors += 1;
      if (errorSamples.length < 5) {
        errorSamples.push({ fan_id: r.fan_id, error: updErr.message });
      }
    } else {
      updated += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    fansComputed: rows.length,
    updated,
    errors,
    errorSamples,
    durationMs: Date.now() - started,
  });
}
