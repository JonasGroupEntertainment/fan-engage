import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { indexRow, type SourceTable } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/embeddings-backfill
 *
 * Scheduled via vercel.json every 15 minutes. Walks rows that don't yet
 * have an entry in content_embeddings — across all 6 indexed source tables —
 * and embeds them in small batches.
 *
 * This is the safety net for the inline indexing path: even if the
 * fire-and-forget call from a server action fails (network blip,
 * OPENAI_API_KEY missing, OpenAI 5xx), the row eventually gets indexed
 * here. Idempotent — uses content_hash to skip already-embedded rows.
 *
 * Auth: same Bearer $CRON_SECRET header pattern as the other cron jobs.
 *
 * Throughput cap: BATCH_SIZE per run keeps each invocation under the
 * Vercel function 60-second budget and prevents any single backfill from
 * blowing through the OpenAI rate limit.
 */

/** Max rows to process per cron tick. At every-15-min cadence this is
 *  240 rows/hour or ~5,800/day — plenty of headroom for Fan Engage's
 *  expected write volume. Bump if backfill is falling behind. */
const BATCH_SIZE = 50;

interface BackfillSummary {
  totalCandidates: number;
  processed: number;
  byStatus: Record<string, number>;
  byTable: Partial<Record<SourceTable, number>>;
  errors: Array<{ table: SourceTable; rowId: string; error: string }>;
  durationMs: number;
}

export async function GET(request: Request) {
  return runCron(request, "embeddings-backfill", () => embeddingsBackfill());
}

async function embeddingsBackfill() {
  const started = Date.now();
  const summary: BackfillSummary = {
    totalCandidates: 0,
    processed: 0,
    byStatus: {},
    byTable: {},
    errors: [],
    durationMs: 0,
  };

  try {
    const admin = createAdminClient();

    // 1. Find candidate rows. The list_unembedded_rows() Postgres function
    //    (defined in migration 0024) walks all 6 source tables and returns
    //    rows missing an entry in content_embeddings.
    const { data: candidates, error: listErr } = await admin.rpc(
      "list_unembedded_rows",
      { p_limit: BATCH_SIZE },
    );

    if (listErr) {
      return NextResponse.json(
        { error: `list_unembedded_rows failed: ${listErr.message}` },
        { status: 500 },
      );
    }

    const rows = (candidates ?? []) as Array<{
      source_table: SourceTable;
      source_id: string;
      community_id: string;
    }>;
    summary.totalCandidates = rows.length;

    // 2. Index sequentially. Concurrency = 1 keeps us well under any
    //    rate limit and gives us deterministic logs. If backfill ever
    //    becomes the bottleneck (e.g. 100k+ historical rows), bump to
    //    Promise.all with a chunk-of-5 concurrency limit.
    for (const row of rows) {
      // For the communities table, list_unembedded_rows returns the slug-
      // derived sentinel uuid as source_id. But indexRow expects to be
      // called with the underlying primary key (the slug for communities,
      // the uuid for everything else). Translate here.
      const rowKey =
        row.source_table === "communities" ? row.community_id : row.source_id;

      const result = await indexRow(row.source_table, rowKey);
      summary.processed += 1;
      summary.byStatus[result.status] = (summary.byStatus[result.status] ?? 0) + 1;
      summary.byTable[row.source_table] =
        (summary.byTable[row.source_table] ?? 0) + 1;

      if (result.status === "error") {
        summary.errors.push({
          table: row.source_table,
          rowId: rowKey,
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
