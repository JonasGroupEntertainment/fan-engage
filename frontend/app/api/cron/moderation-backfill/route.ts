import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderateRow, type ModerateSourceTable } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/moderation-backfill
 *
 * Scheduled via vercel.json every 15 minutes. Walks rows still
 * pending moderation classification across community_posts +
 * community_comments and classifies them in small batches.
 *
 * Safety net for the inline moderation path: even if the
 * fire-and-forget call from a server action fails, the row eventually
 * gets classified here. Idempotent — re-classifying just overwrites
 * the existing decision and adds another row to the audit log.
 *
 * Auth: same Bearer $CRON_SECRET pattern as the other cron jobs.
 */

/** Max rows to process per cron tick. Sequential at 1-2 sec each, so
 *  BATCH_SIZE * 2 < 60 (Vercel function timeout). */
const BATCH_SIZE = 25;

interface BackfillSummary {
  totalCandidates: number;
  processed: number;
  byStatus: Record<string, number>;
  byTable: Partial<Record<ModerateSourceTable, number>>;
  byClassification: Record<string, number>;
  selfHarmFlagged: number;
  errors: Array<{ table: ModerateSourceTable; rowId: string; error: string }>;
  durationMs: number;
}

export async function GET(request: Request) {
  return runCron(request, "moderation-backfill", () => moderationBackfill());
}

async function moderationBackfill() {
  const started = Date.now();
  const summary: BackfillSummary = {
    totalCandidates: 0,
    processed: 0,
    byStatus: {},
    byTable: {},
    byClassification: {},
    selfHarmFlagged: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const admin = createAdminClient();

    const { data: candidates, error: listErr } = await admin.rpc(
      "list_pending_moderation",
      { p_limit: BATCH_SIZE },
    );

    if (listErr) {
      return NextResponse.json(
        { error: `list_pending_moderation failed: ${listErr.message}` },
        { status: 500 },
      );
    }

    const rows = (candidates ?? []) as Array<{
      source_table: ModerateSourceTable;
      source_id: string;
      body_text: string;
      context: Record<string, unknown>;
    }>;
    summary.totalCandidates = rows.length;

    // Sequential — concurrency=1. Anthropic rate limits are generous
    // (50 RPM tier-1) but classification is a few seconds each, so
    // sequential keeps function-execution time under 60s and gives
    // deterministic logs.
    for (const row of rows) {
      const result = await moderateRow(row.source_table, row.source_id);
      summary.processed += 1;
      summary.byStatus[result.status] = (summary.byStatus[result.status] ?? 0) + 1;
      summary.byTable[row.source_table] =
        (summary.byTable[row.source_table] ?? 0) + 1;

      if (result.status === "classified") {
        const decision = result.decision.status;
        summary.byClassification[decision] =
          (summary.byClassification[decision] ?? 0) + 1;
        if (result.decision.self_harm_detected) {
          summary.selfHarmFlagged += 1;
        }
      }

      if (result.status === "error") {
        summary.errors.push({
          table: row.source_table,
          rowId: row.source_id,
          error: result.error,
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
