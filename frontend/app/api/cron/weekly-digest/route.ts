import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  prepareDigestForFan,
  fireDigestCampaign,
  recordDigestSent,
} from "@/lib/digest/send";
import { unsentCampaignError } from "@/lib/digest/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-digest
 *
 * Scheduled via vercel.json Sundays 09:00 UTC. Sends the personalized
 * weekly digest to every active opted-in fan.
 *
 * Pipeline:
 *   1. Auth check (Bearer $CRON_SECRET).
 *   2. list_digest_recipients(BATCH_SIZE) — only fans whose last digest
 *      is >6 days old, opted-in, not suspended.
 *   3. For each recipient: gather → summarize → render → PUT Mailchimp
 *      merge fields. Capture rendered HTML for digest_log audit.
 *   4. After per-fan prep, fire ONE Mailchimp campaign that injects each
 *      recipient's *|DIGESTHTML|* merge value at send time.
 *   5. Record one digest_log row per fan, plus the campaign id.
 *
 * Returns a structured summary so the cron caller can audit each run.
 *
 * Cost reference (per run, at 200 active fans):
 *   * Anthropic: 200 fans × ~3 community summaries × ~$0.0001 ≈ $0.06
 *   * Mailchimp: 200 PUTs (free) + 1 campaign send (covered by plan)
 *   * Total: ~$0.06/week, ~$3/year
 */

const BATCH_SIZE = 500;

interface DigestRunSummary {
  totalCandidates: number;
  prepared: number;
  preparedWithMailchimp: number;
  skipped: number;
  errors: Array<{ fan_id: string; error: string }>;
  campaignId: string | null;
  campaignError: string | null;
  weekStart: string;
  durationMs: number;
}

export async function GET(request: Request) {
  return runCron(request, "weekly-digest", () => weeklyDigest(request));
}

async function weeklyDigest(request: Request) {
  // Don't 503 on missing ANTHROPIC_API_KEY — the digest still ships with
  // fallback summaries. But ANTHROPIC missing is a quality issue worth
  // surfacing, so include in the response.
  const aiAvailable = Boolean(process.env.ANTHROPIC_API_KEY);

  const started = Date.now();
  const weekStart = mondayOfThisWeekUTC();
  const summary: DigestRunSummary = {
    totalCandidates: 0,
    prepared: 0,
    preparedWithMailchimp: 0,
    skipped: 0,
    errors: [],
    campaignId: null,
    campaignError: null,
    weekStart,
    durationMs: 0,
  };

  try {
    const admin = createAdminClient();

    const currentHourUtc = new Date().getUTCHours();
    const { data: candidates, error: listErr } = await admin.rpc(
      "list_digest_recipients_at_hour",
      { p_hour: currentHourUtc, p_limit: BATCH_SIZE },
    );
    if (listErr) {
      return NextResponse.json(
        { error: `list_digest_recipients failed: ${listErr.message}` },
        { status: 500 },
      );
    }

    let recipients = (candidates ?? []) as Array<{
      fan_id: string;
      email: string;
      first_name: string | null;
      total_points: number;
      current_tier: string;
    }>;

    // Test-mode: filter to a single email so manual smoke tests don't
    // blast the whole audience. Pass ?testEmail=you@example.com along
    // with the Bearer auth header. The fan must already be in the
    // candidate set (i.e., opted-in, not suspended, last digest >6 days
    // old) — if they aren't, the cron returns totalCandidates=0.
    const url = new URL(request.url);
    const testEmail = url.searchParams.get("testEmail");
    if (testEmail) {
      const before = recipients.length;
      recipients = recipients.filter(
        (r) => r.email.toLowerCase() === testEmail.toLowerCase(),
      );
      console.log(
        `[cron weekly-digest] testEmail=${testEmail} filter: ${before} -> ${recipients.length}`,
      );
    }

    summary.totalCandidates = recipients.length;

    // Process sequentially. Per-fan latency is gather (50-200ms) +
    // 3× Anthropic summary (~3s total) + 1 Mailchimp PUT (~200ms),
    // call it ~3.5s per fan × 100 fans = ~6 minutes. We're well under
    // Vercel's 60s function budget per call only if we cap BATCH_SIZE
    // OR run on the longer-timeout 'maxDuration' setting. For V1 we
    // accept that batches >~15 fans require a Pro plan. If the cron
    // times out, the surviving fans get processed next Sunday.
    for (const r of recipients) {
      const result = await prepareDigestForFan(r);

      if (
        result.status === "rendered" ||
        result.status === "merge_fields_updated"
      ) {
        summary.prepared += 1;
        if (result.status === "merge_fields_updated") {
          summary.preparedWithMailchimp += 1;
        }
      } else {
        summary.skipped += 1;
      }

      if (result.status === "error" && result.error) {
        summary.errors.push({ fan_id: r.fan_id, error: result.error });
        logFanError(r.fan_id, result.error);
      }

      // Always write digest_log so we have a record of every attempt
      // (including no-payload skips and errors). Skip reasons use the
      // allowed status "skipped"; the reason stays in error_message.
      const recorded = await recordDigestSent({
        fan_id: r.fan_id,
        week_start: weekStart,
        status: result.status,
        campaign_id: null, // filled in after the campaign fires
        html_body: result.htmlBody ?? null,
        text_body: result.textBody ?? null,
        ai_summary_count: result.aiSummaryCount ?? null,
        payload_communities: result.payloadCommunities ?? null,
        payload_post_ids: result.payloadPostIds ?? null,
        error_message: result.error ?? null,
      });
      if (!recorded.ok) {
        summary.errors.push({ fan_id: r.fan_id, error: recorded.error });
        logFanError(r.fan_id, recorded.error);
      }
    }

    // Fire the campaign — only if at least one fan got merge fields set.
    if (summary.preparedWithMailchimp > 0) {
      const campaign = await fireDigestCampaign(summary.preparedWithMailchimp);
      if (campaign.ok) {
        summary.campaignId = campaign.campaignId;
        // Backfill the campaign id onto all just-prepared digest_log rows.
        await admin
          .from("digest_log")
          .update({ status: "sent", mailchimp_campaign_id: campaign.campaignId })
          .eq("week_start", weekStart)
          .eq("status", "merge_fields_updated");
      } else {
        summary.campaignError = campaign.error;
      }
    } else {
      // No merge-field writes. That is a failure only when a fan errored
      // (query, Mailchimp, or digest_log). An all-skip week is success
      // with nothing to send.
      summary.campaignError = unsentCampaignError({
        totalCandidates: summary.totalCandidates,
        errors: summary.errors,
      });
    }

    summary.durationMs = Date.now() - started;
    const failed = Boolean(summary.campaignError);
    return NextResponse.json(
      {
        ok: !failed,
        aiAvailable,
        summary,
      },
      { status: failed ? 500 : 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        partial: summary,
      },
      { status: 500 },
    );
  }
}

function logFanError(fanId: string, error: string): void {
  console.error(
    JSON.stringify({
      source: "cron",
      job: "weekly-digest",
      event: "fan_error",
      fan_id: fanId,
      error: error.slice(0, 800),
    }),
  );
}

/** Returns YYYY-MM-DD for Monday 00:00 UTC of the current week. */
function mondayOfThisWeekUTC(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}
