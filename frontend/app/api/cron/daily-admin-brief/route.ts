import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import {
  gatherAdminBriefMetrics,
  summarizeAdminBrief,
  persistAndDispatchBrief,
} from "@/lib/admin-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily-admin-brief
 *
 * Scheduled via vercel.json once per day at 13:00 UTC (8am Central).
 * Pulls week-over-week metrics for every active community, asks Claude
 * Haiku for a Slack-ready narrative, persists into admin_briefs, and
 * posts to Slack if SLACK_ADMIN_WEBHOOK_URL is configured.
 *
 * Auth: same Bearer CRON_SECRET pattern as the rest of the cron suite.
 *
 * Failure modes:
 *   401 — missing/wrong CRON_SECRET
 *   500 — anything else (logged + partial summary returned)
 *
 * Note: this route does NOT 503 when ANTHROPIC_API_KEY is missing —
 * summarizeAdminBrief gracefully degrades to a deterministic fallback
 * narrative. The brief still ships, just less polished.
 */
export async function GET(request: Request) {
  return runCron(request, "daily-admin-brief", () => dailyAdminBrief());
}

async function dailyAdminBrief() {
  const started = Date.now();
  try {
    const metrics = await gatherAdminBriefMetrics(new Date());
    const summary = await summarizeAdminBrief(metrics);
    const generatedMs = Date.now() - started;
    const result = await persistAndDispatchBrief(metrics, summary, generatedMs);

    return NextResponse.json({
      ok: true,
      brief_id: result.brief_id,
      channels_sent: result.channels_sent,
      errors: result.errors,
      took_ms: Date.now() - started,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/cron/daily-admin-brief] failed:", msg);
    return NextResponse.json(
      { error: msg, took_ms: Date.now() - started },
      { status: 500 },
    );
  }
}
