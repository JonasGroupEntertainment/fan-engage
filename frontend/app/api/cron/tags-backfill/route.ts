import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tagRow } from "@/lib/tagging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/tags-backfill
 *
 * Scheduled via vercel.json every 15 minutes. Walks community_posts
 * rows where tagged_at is null (excluding auto_hide) and classifies
 * them in small batches. Same auth + 503-on-missing-key pattern as
 * the embeddings/moderation crons.
 *
 * Idempotent — re-tagging just overwrites tags. We could re-run on
 * already-tagged rows when bumping TAG_PROMPT_VERSION (just clear
 * tagged_at for rows whose tag_prompt_version is stale).
 */

const BATCH_SIZE = 30;

interface BackfillSummary {
  totalCandidates: number;
  processed: number;
  byStatus: Record<string, number>;
  errors: Array<{ post_id: string; error: string }>;
  durationMs: number;
}

export async function GET(request: Request) {
  return runCron(request, "tags-backfill", () => tagsBackfill());
}

async function tagsBackfill() {
  const started = Date.now();
  const summary: BackfillSummary = {
    totalCandidates: 0,
    processed: 0,
    byStatus: {},
    errors: [],
    durationMs: 0,
  };

  try {
    const admin = createAdminClient();

    const { data: candidates, error: listErr } = await admin.rpc(
      "list_untagged_posts",
      { p_limit: BATCH_SIZE },
    );
    if (listErr) {
      return NextResponse.json(
        { error: `list_untagged_posts failed: ${listErr.message}` },
        { status: 500 },
      );
    }

    const rows = (candidates ?? []) as Array<{
      post_id: string;
      artist_slug: string;
      body_text: string;
    }>;
    summary.totalCandidates = rows.length;

    // Sequential — concurrency=1. Per-row cost ~1.5s (Anthropic +
    // Supabase update). BATCH_SIZE=30 keeps each cron tick under ~50s,
    // safely under Vercel's 60s function budget.
    for (const row of rows) {
      const result = await tagRow(row.post_id);
      summary.processed += 1;
      summary.byStatus[result.status] = (summary.byStatus[result.status] ?? 0) + 1;
      if (result.status === "error") {
        summary.errors.push({ post_id: row.post_id, error: result.error });
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
