import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  emptyBackfillSummary,
  indexRow,
  isKnownCommunity,
  noteIndexResult,
  noteSkippedOrphan,
  orphanSkipLog,
  selectEmbeddingWork,
  type BackfillSummary,
  type SkippedOrphan,
  type SourceTable,
} from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/embeddings-backfill
 *
 * Scheduled via vercel.json every 15 minutes. Walks rows that don't yet
 * have an entry in content_embeddings — across all indexed source tables —
 * and embeds them in small batches.
 *
 * This is the safety net for the inline indexing path: even if the
 * fire-and-forget call from a server action fails (network blip,
 * OPENAI_API_KEY missing, OpenAI 5xx), the row eventually gets indexed
 * here. Idempotent — uses content_hash to skip already-embedded rows.
 *
 * Rows whose tenant slug is not a communities.slug are skipped and logged.
 * They are not written to summary.errors, so one orphan cannot fail the
 * run or block valid rows in the same batch. content_embeddings.community_id
 * references communities(slug); community_posts.artist_slug does not.
 *
 * Auth: same Bearer $CRON_SECRET header pattern as the other cron jobs.
 *
 * Throughput cap: BATCH_SIZE per run keeps each invocation under the
 * Vercel function 60-second budget and prevents any single backfill from
 * blowing through the OpenAI rate limit.
 */

/** Max rows to embed per cron tick. At every-15-min cadence this is
 *  240 rows/hour or ~5,800/day — plenty of headroom for Fan Engage's
 *  expected write volume. Bump if backfill is falling behind. */
const BATCH_SIZE = 50;

/**
 * How many unembedded rows to pull before dropping orphans. The SQL
 * function has no ORDER BY, so a handful of orphan posts can occupy the
 * front of a small page forever. Headroom lets valid rows in the same
 * fetch still be embedded. Migration 0083 stops returning orphans.
 */
const CANDIDATE_LIMIT = 200;

export async function GET(request: Request) {
  return runCron(request, "embeddings-backfill", () => embeddingsBackfill());
}

async function embeddingsBackfill() {
  const started = Date.now();
  const summary: BackfillSummary = emptyBackfillSummary();

  try {
    const admin = createAdminClient();

    // 1. Find candidate rows. The list_unembedded_rows() Postgres function
    //    (defined in migration 0024, narrowed in 0083) walks the indexed
    //    source tables and returns rows missing an entry in content_embeddings.
    const { data: candidates, error: listErr } = await admin.rpc(
      "list_unembedded_rows",
      { p_limit: CANDIDATE_LIMIT },
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

    const { data: communityRows, error: communityErr } = await admin
      .from("communities")
      .select("slug");
    const knownSlugs =
      communityErr || !communityRows || communityRows.length === 0
        ? null
        : new Set(
            communityRows
              .map((row) => row.slug)
              .filter((slug): slug is string => typeof slug === "string" && slug.length > 0),
          );
    if (!knownSlugs) {
      console.error(
        `[embeddings] communities lookup failed (${communityErr?.message ?? "no rows"}); orphan rows will be skipped inside indexRow`,
      );
    }

    const { toEmbed, orphans } = knownSlugs
      ? selectEmbeddingWork(rows, knownSlugs, BATCH_SIZE)
      : { toEmbed: rows.slice(0, BATCH_SIZE), orphans: [] as typeof rows };

    // Log every live orphan, not only the ones on this RPC page. After
    // migration 0083 the RPC stops returning them, and this scan is what
    // keeps the skip visible until the rows are cleaned up.
    const skipped = new Set<string>();
    if (knownSlugs) {
      for (const item of await loadEmbeddingOrphans(admin, knownSlugs)) {
        rememberOrphan(summary, skipped, item);
      }
    }
    for (const orphan of orphans) {
      rememberOrphan(summary, skipped, {
        table: orphan.source_table,
        rowId: embeddingRowKey(orphan),
        communityId: orphan.community_id,
      });
    }

    // 2. Index sequentially. Concurrency = 1 keeps us well under any
    //    rate limit and gives us deterministic logs. If backfill ever
    //    becomes the bottleneck (e.g. 100k+ historical rows), bump to
    //    Promise.all with a chunk-of-5 concurrency limit.
    for (const row of toEmbed) {
      // For the communities table, list_unembedded_rows returns the slug-
      // derived sentinel uuid as source_id. But indexRow expects to be
      // called with the underlying primary key (the slug for communities,
      // the uuid for everything else). Translate here.
      const rowKey = embeddingRowKey(row);
      const result = await indexRow(row.source_table, rowKey);
      noteIndexResult(summary, row.source_table, rowKey, result);
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

function embeddingRowKey(row: {
  source_table: SourceTable;
  source_id: string;
  community_id: string;
}): string {
  return row.source_table === "communities" ? row.community_id : row.source_id;
}

function rememberOrphan(
  summary: BackfillSummary,
  seen: Set<string>,
  item: SkippedOrphan,
): void {
  const key = `${item.table}:${item.rowId}`;
  if (seen.has(key)) return;
  seen.add(key);
  noteSkippedOrphan(summary, item);
  console.error(orphanSkipLog(item));
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Source rows the embedder would reject because their tenant slug is not
 * a communities.slug. Mirrors list_unembedded_rows' tenant columns:
 * posts and events use artist_slug, comments inherit the parent post's
 * artist_slug, rewards use community_id.
 */
async function loadEmbeddingOrphans(
  admin: AdminClient,
  knownSlugs: ReadonlySet<string>,
): Promise<SkippedOrphan[]> {
  const found: SkippedOrphan[] = [];

  const posts = await admin.from("community_posts").select("id, artist_slug");
  if (posts.error) {
    console.error(
      `[embeddings] orphan scan community_posts failed: ${posts.error.message}`,
    );
  } else {
    for (const post of posts.data ?? []) {
      const communityId = String(post.artist_slug ?? "");
      if (!isKnownCommunity(communityId, knownSlugs)) {
        found.push({
          table: "community_posts",
          rowId: String(post.id),
          communityId,
        });
      }
    }
  }

  const events = await admin
    .from("artist_events")
    .select("id, artist_slug")
    .eq("active", true);
  if (events.error) {
    console.error(
      `[embeddings] orphan scan artist_events failed: ${events.error.message}`,
    );
  } else {
    for (const event of events.data ?? []) {
      const communityId = String(event.artist_slug ?? "");
      if (!isKnownCommunity(communityId, knownSlugs)) {
        found.push({
          table: "artist_events",
          rowId: String(event.id),
          communityId,
        });
      }
    }
  }

  const rewards = await admin
    .from("rewards_catalog")
    .select("id, community_id")
    .eq("active", true);
  if (rewards.error) {
    console.error(
      `[embeddings] orphan scan rewards_catalog failed: ${rewards.error.message}`,
    );
  } else {
    for (const reward of rewards.data ?? []) {
      if (reward.community_id == null) continue;
      const communityId = String(reward.community_id);
      if (!isKnownCommunity(communityId, knownSlugs)) {
        found.push({
          table: "rewards_catalog",
          rowId: String(reward.id),
          communityId,
        });
      }
    }
  }

  const comments = await admin
    .from("community_comments")
    .select("id, community_posts!inner(artist_slug)");
  if (comments.error) {
    console.error(
      `[embeddings] orphan scan community_comments failed: ${comments.error.message}`,
    );
  } else {
    for (const comment of comments.data ?? []) {
      const parent = comment.community_posts as
        | { artist_slug?: string }
        | { artist_slug?: string }[]
        | null;
      const artistSlug = Array.isArray(parent)
        ? parent[0]?.artist_slug
        : parent?.artist_slug;
      const communityId = String(artistSlug ?? "");
      if (!isKnownCommunity(communityId, knownSlugs)) {
        found.push({
          table: "community_comments",
          rowId: String(comment.id),
          communityId,
        });
      }
    }
  }

  return found;
}
