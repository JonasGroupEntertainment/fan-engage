/**
 * Index a single row into content_embeddings.
 *
 * This is the entry point used by:
 *   * Inline indexing — server actions on post create / update call
 *     `indexRowAsync(...)` in fire-and-forget mode after the row is
 *     committed.
 *   * Backfill cron — finds rows without an embedding and indexes them.
 *
 * The function is idempotent: if a row's content hasn't changed, the
 * existing embedding is left in place. Useful for the backfill cron and
 * for tolerating duplicate inline calls.
 *
 * Errors are caught and logged; the function returns a status string so
 * callers (cron) can summarize. Callers should NOT throw on indexing
 * failures — the post itself was already saved.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { embedText, EmbeddingError, pgvectorLiteral } from "./client";
import { isMissingCommunityError, orphanSkipLog } from "./orphans";
import { contentHash, SOURCES, type SourceTable } from "./sources";

export type IndexResult =
  | { status: "indexed"; tokensEmbedded: number }
  | { status: "skipped_unchanged" }
  | { status: "skipped_empty" }
  | { status: "skipped_no_row" }
  | { status: "skipped_orphan"; communityId: string }
  | { status: "error"; error: string };

/**
 * Embed a single source row and write/upsert it into content_embeddings.
 *
 * For uuid-keyed tables, `rowId` is the row's id (uuid).
 * For `communities` (slug-keyed), `rowId` is the slug — we derive a stable
 * uuid from md5('community:' || slug) for the source_id column.
 */
export async function indexRow(
  table: SourceTable,
  rowId: string,
): Promise<IndexResult> {
  const descriptor = SOURCES[table];
  if (!descriptor) {
    return { status: "error", error: `Unknown source table: ${table}` };
  }

  try {
    const admin = createAdminClient();

    // 1. Fetch the source row. community_comments needs a parent-post join
    //    to inherit community_id + visibility; communities is slug-keyed;
    //    everything else is straightforward uuid lookup.
    let row: Record<string, unknown> | null = null;

    if (table === "community_comments") {
      const { data, error } = await admin
        .from("community_comments")
        .select(
          "id, post_id, body, community_posts!inner(artist_slug, visibility)",
        )
        .eq("id", rowId)
        .maybeSingle();
      if (error) return { status: "error", error: error.message };
      if (!data) return { status: "skipped_no_row" };

      const post = (
        data as unknown as {
          community_posts: { artist_slug: string; visibility: string };
        }
      ).community_posts;
      row = {
        id: data.id,
        post_id: data.post_id,
        body: data.body,
        // Hand the inherited tenant + visibility to extractMeta in the
        // shape it expects.
        artist_slug: post?.artist_slug,
        community_id: post?.artist_slug,
        visibility: post?.visibility,
      };
    } else if (table === "communities") {
      // Slug-keyed.
      const { data, error } = await admin
        .from("communities")
        .select(descriptor.columns)
        .eq("slug", rowId)
        .maybeSingle();
      if (error) return { status: "error", error: error.message };
      if (!data) return { status: "skipped_no_row" };
      row = data as unknown as Record<string, unknown>;
    } else {
      // Standard uuid-keyed tables.
      const { data, error } = await admin
        .from(table)
        .select(descriptor.columns)
        .eq("id", rowId)
        .maybeSingle();
      if (error) return { status: "error", error: error.message };
      if (!data) return { status: "skipped_no_row" };
      row = data as unknown as Record<string, unknown>;
    }

    if (!row) return { status: "skipped_no_row" };

    // Tenant key is written to content_embeddings.community_id, which
    // references communities(slug). Resolve it before calling OpenAI so a
    // missing community is a skip, not a failed embedding request.
    const meta = descriptor.extractMeta(row);
    const communityId = meta.community_id.trim();
    if (!communityId) {
      console.error(orphanSkipLog({ table, rowId, communityId }));
      return { status: "skipped_orphan", communityId };
    }
    const { data: community, error: communityErr } = await admin
      .from("communities")
      .select("slug")
      .eq("slug", communityId)
      .maybeSingle();
    if (communityErr) return { status: "error", error: communityErr.message };
    if (!community) {
      console.error(orphanSkipLog({ table, rowId, communityId }));
      return { status: "skipped_orphan", communityId };
    }

    // 2. Build the embeddable text.
    const text = descriptor.buildText(row);
    if (!text || !text.trim()) return { status: "skipped_empty" };
    const hash = contentHash(text);

    // 3. Idempotency check — if we already have an embedding for this
    //    source row with the same content_hash, skip the API call.
    const { data: existing } = await admin
      .from("content_embeddings")
      .select("id, content_hash")
      .eq("source_table", table)
      .eq("source_id", meta.source_id)
      .maybeSingle();

    if (existing && existing.content_hash === hash) {
      return { status: "skipped_unchanged" };
    }

    // 4. Embed.
    const vector = await embedText(text);
    if (!vector) return { status: "skipped_empty" };

    // 5. Upsert. Conflict target is (source_table, source_id) per the
    //    unique constraint in migration 0024.
    const { error: upsertError } = await admin
      .from("content_embeddings")
      .upsert(
        {
          source_table: table,
          source_id: meta.source_id,
          community_id: communityId,
          visibility: meta.visibility,
          embedding: pgvectorLiteral(vector),
          content_hash: hash,
          embedded_at: new Date().toISOString(),
        },
        { onConflict: "source_table,source_id" },
      );
    if (upsertError) {
      if (isMissingCommunityError(upsertError.message)) {
        console.error(orphanSkipLog({ table, rowId, communityId }));
        return { status: "skipped_orphan", communityId };
      }
      return { status: "error", error: upsertError.message };
    }

    return { status: "indexed", tokensEmbedded: text.length };
  } catch (err) {
    const message =
      err instanceof EmbeddingError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    if (isMissingCommunityError(message)) {
      console.error(orphanSkipLog({ table, rowId, communityId: "unknown" }));
      return { status: "skipped_orphan", communityId: "unknown" };
    }
    console.error(`[embeddings] indexRow ${table}/${rowId} failed:`, message);
    return { status: "error", error: message };
  }
}

/**
 * Fire-and-forget version for use inside server actions on post create.
 *
 *   import { indexRowAsync } from "@/lib/embeddings";
 *   ...
 *   indexRowAsync("community_posts", newPost.id);  // no await
 *
 * The Promise is intentionally not awaited; we don't want the user's
 * response to block on OpenAI's API. The backfill cron is the safety net
 * for cases where this fire-and-forget path fails.
 */
export function indexRowAsync(table: SourceTable, rowId: string): void {
  // Schedule on the next tick so it doesn't share the request's lifecycle.
  void Promise.resolve().then(() => indexRow(table, rowId));
}
