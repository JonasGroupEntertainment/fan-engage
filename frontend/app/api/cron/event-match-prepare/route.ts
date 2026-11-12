import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchEvent } from "@/lib/event-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/event-match-prepare
 *
 * Walks artist_events rows where match_processed_at IS NULL (and the
 * event is active and not in the past) and pre-computes the candidate
 * set into event_match_log. Does NOT send notifications — that's an
 * explicit admin click in /admin/artists/[slug]/events/[id]/match.
 *
 * The point of pre-computing is so that when the admin opens the
 * preview page, they see a ready candidate list instead of waiting
 * for the page to compute it inline.
 *
 * Scheduled every 15 minutes via vercel.json. Same auth pattern as
 * the rest of the cron suite.
 */

const BATCH_SIZE = 10;

interface PrepareSummary {
  totalCandidates: number;
  processed: number;
  errors: Array<{ event_id: string; error: string }>;
  durationMs: number;
}

export async function GET(request: Request) {
  return runCron(request, "event-match-prepare", () => eventMatchPrepare());
}

async function eventMatchPrepare() {
  const started = Date.now();
  const summary: PrepareSummary = {
    totalCandidates: 0,
    processed: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const admin = createAdminClient();

    const { data: candidates, error: listErr } = await admin.rpc(
      "list_unmatched_events",
      { p_limit: BATCH_SIZE },
    );
    if (listErr) {
      return NextResponse.json(
        { error: `list_unmatched_events failed: ${listErr.message}` },
        { status: 500 },
      );
    }

    const rows = (candidates ?? []) as Array<{
      event_id: string;
      artist_slug: string;
      starts_at: string | null;
    }>;
    summary.totalCandidates = rows.length;

    // Sequential is fine — matchEvent is mostly Supabase reads + one
    // upsert. BATCH_SIZE=10 keeps us well under Vercel's 60s cap.
    for (const row of rows) {
      try {
        await matchEvent(row.event_id);
        summary.processed += 1;
      } catch (err) {
        summary.errors.push({
          event_id: row.event_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        partial: summary,
      },
      { status: 500 },
    );
  }

  summary.durationMs = Date.now() - started;
  return NextResponse.json({ ok: true, summary });
}
