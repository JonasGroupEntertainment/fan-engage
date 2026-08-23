/**
 * Semantic search workhorse.
 *
 * Pipeline:
 *   1. Embed the user's query via OpenAI (reuses lib/embeddings client).
 *   2. Call the search_embeddings(...) Postgres RPC (defined in
 *      migration 0024) to get the top-K nearest content_embeddings
 *      rows by cosine distance.
 *   3. Fetch the source rows from the underlying tables in batched
 *      queries (one per source_table that has hits).
 *   4. Group + order by source_table for the results page.
 *
 * Pure embedding similarity for V1. The recs doc mentions an optional
 * LLM re-rank step (top-50 → Claude rerank → top-10) for quality;
 * we'll add that in V2 if pure-vector quality feels lacking. Adding
 * it later is one new file (lib/search/rerank.ts) and one extra await
 * in this function.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderDraftPost } from "@/lib/community/placeholder-draft";
import { embedText, pgvectorLiteral, slugToSourceId, EmbeddingError } from "@/lib/embeddings";
import { cachedEmbedQuery } from "./embed-cache";
import type {
  SearchHit,
  SearchHitData,
  SearchResults,
  SearchSourceTable,
} from "./types";

/** How many candidate hits to pull from pgvector before grouping/trimming. */
const RAW_LIMIT = 30;

/** How many hits to surface per group on the results page. */
const PER_GROUP_LIMIT = 8;

/** Minimum query length — single-letter queries blow out the index
 *  and almost never produce useful results. */
const MIN_QUERY_LENGTH = 2;

/** Distance threshold above which we drop hits as "not really relevant".
 *  pgvector cosine distance is in [0, 2]; in practice, anything > 0.85
 *  is noise for fan-content embeddings. */
const MAX_DISTANCE = 0.85;

interface RawHit {
  source_table: SearchSourceTable;
  source_id: string;
  community_id: string;
  visibility: string;
  distance: number;
}

export async function search(query: string): Promise<SearchResults> {
  const started = Date.now();
  const trimmed = query.trim();

  // Empty / too-short query — return an empty result set without
  // burning an OpenAI call.
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return emptyResults(trimmed, started);
  }

  // 1. Embed the query.
  let queryVector: number[] | null;
  try {
    queryVector = await cachedEmbedQuery(trimmed);
  } catch (err) {
    if (err instanceof EmbeddingError) {
      // Bubble up — caller (the API route) decides whether to 503 or fail.
      throw err;
    }
    throw err;
  }
  if (!queryVector) return emptyResults(trimmed, started);

  // 2. Vector search via the search_embeddings RPC.
  const admin = createAdminClient();
  const { data: rawHits, error } = await admin.rpc("search_embeddings", {
    p_query: pgvectorLiteral(queryVector),
    p_visibility: "public",
    p_limit: RAW_LIMIT,
  });

  if (error) {
    throw new Error(`search_embeddings RPC failed: ${error.message}`);
  }

  const hits: RawHit[] = ((rawHits ?? []) as RawHit[]).filter(
    (h) => h.distance <= MAX_DISTANCE,
  );

  if (hits.length === 0) return emptyResults(trimmed, started);

  // 3. Fetch source rows in batched queries — one per source_table.
  const idsByTable: Record<SearchSourceTable, string[]> = {
    community_posts: [],
    community_comments: [],
    communities: [],
    artist_events: [],
    rewards_catalog: [],
  };
  for (const h of hits) {
    idsByTable[h.source_table].push(h.source_id);
  }

  const sourceData = await fetchAllSourceRows(idsByTable);

  // 4. Stitch hits + source data, drop hits whose source row was
  //    deleted between embedding + query (rare but possible).
  const enriched: SearchHit[] = [];
  let missingSourceRows = 0;
  for (const h of hits) {
    const data = sourceData[h.source_table].get(h.source_id);
    if (!data) {
      missingSourceRows += 1;
      continue;
    }
    enriched.push({
      source_table: h.source_table,
      source_id: h.source_id,
      community_id: h.community_id,
      distance: h.distance,
      data,
    });
  }

  // 5. Group + cap per group. Hits are already ordered by distance asc
  //    from the RPC, so per-group ordering is preserved.
  const groups: SearchResults["groups"] = {
    artists: [],
    fans: [],
    communities: [],
    posts: [],
    events: [],
    rewards: [],
    comments: [],
  };
  for (const h of enriched) {
    switch (h.source_table) {
      case "communities":
        if (groups.communities.length < PER_GROUP_LIMIT) groups.communities.push(h);
        break;
      case "community_posts":
        if (groups.posts.length < PER_GROUP_LIMIT) groups.posts.push(h);
        break;
      case "artist_events":
        if (groups.events.length < PER_GROUP_LIMIT) groups.events.push(h);
        break;
      case "rewards_catalog":
        if (groups.rewards.length < PER_GROUP_LIMIT) groups.rewards.push(h);
        break;
      case "community_comments":
        if (groups.comments.length < PER_GROUP_LIMIT) groups.comments.push(h);
        break;
    }
  }

  // 6. Name-match artists and fans in parallel — no embeddings needed.
  const pattern = `%${trimmed}%`;
  const [artistRows, fanRows] = await Promise.all([
    admin
      .from("artists")
      .select("slug, name, tagline")
      .ilike("name", pattern)
      .eq("active", true)
      .limit(PER_GROUP_LIMIT),
    admin
      .from("fans")
      .select("profile_slug, first_name")
      .or(`first_name.ilike.${pattern},profile_slug.ilike.${pattern}`)
      .eq("public_profile_enabled", true)
      .limit(PER_GROUP_LIMIT),
  ]);

  for (const row of (artistRows.data ?? []) as Array<{ slug: string; name: string; tagline: string | null }>) {
    groups.artists.push({
      source_table: "communities",
      source_id: row.slug,
      community_id: row.slug,
      distance: 0,
      data: { kind: "artist", slug: row.slug, name: row.name, tagline: row.tagline },
    });
  }

  for (const row of (fanRows.data ?? []) as Array<{ profile_slug: string; first_name: string | null }>) {
    groups.fans.push({
      source_table: "communities",
      source_id: row.profile_slug,
      community_id: "",
      distance: 0,
      data: { kind: "fan", profile_slug: row.profile_slug, first_name: row.first_name },
    });
  }

  const totalHits = enriched.length + groups.artists.length + groups.fans.length;

  return {
    query: trimmed,
    durationMs: Date.now() - started,
    totalHits,
    missingSourceRows,
    groups,
  };
}

/** Fetch source-row data for every (source_table, [ids]) batch in
 *  parallel. Returns a map per table from id → renderable data. */
async function fetchAllSourceRows(
  idsByTable: Record<SearchSourceTable, string[]>,
): Promise<Record<SearchSourceTable, Map<string, SearchHitData>>> {
  const admin = createAdminClient();
  const out: Record<SearchSourceTable, Map<string, SearchHitData>> = {
    communities: new Map(),
    community_posts: new Map(),
    community_comments: new Map(),
    artist_events: new Map(),
    rewards_catalog: new Map(),
  };

  const tasks: Promise<void>[] = [];

  // Communities — keyed by slug, but content_embeddings.source_id is
  // a deterministic uuid derived from md5('community:'||slug). The
  // hits table already has community_id (the slug) so we look up by
  // slug, not by source_id.
  if (idsByTable.communities.length > 0) {
    // Source IDs for communities are md5-derived uuids — but we ALSO
    // have the community_id (slug) from the hit. The cleaner path is
    // to query by slug, which means we need to pass slugs not source_ids
    // here. For now: use the community_id field on the hit by
    // restructuring upstream. Simpler — a single batch query keyed by
    // slug.
    // (The caller always has community_id available alongside source_id
    //  for communities hits; we re-query by slug below in resolveCommunities.)
  }

  // Communities special-case: requery by slug.
  // (We could also store slug→md5(slug) reverse mapping but it's cheap
  // to just look up by slug since list_unembedded_rows + the hit shape
  // both have slug available as community_id.)
  // We'll handle this inline because the function signature here is
  // already (idsByTable). Add a separate branch.

  // Strategy: fetch communities by slug = community_id from any hit.
  // The caller consolidates this map by source_id.
  // For simplicity, we re-derive the source_id ↔ slug mapping from
  // the original hits — but here we only have idsByTable. Punt: pass
  // the hits separately. (Refactoring inline.)

  // ----- COMMUNITIES -----
  // The source_id for a community embedding is md5('community:'||slug)
  // as uuid. We can't easily reverse-map md5 → slug, so we batch-fetch
  // ALL active communities and filter to those whose md5 matches a hit.
  // At scale (a few dozen communities) this is fine.
  if (idsByTable.communities.length > 0) {
    tasks.push(
      (async () => {
        const { data } = await admin
          .from("communities")
          .select("slug, display_name, tagline, bio")
          .eq("active", true);
        const want = new Set(idsByTable.communities);
        for (const row of (data ?? []) as Array<{
          slug: string;
          display_name: string;
          tagline: string | null;
          bio: string | null;
        }>) {
          const sourceId = slugToSourceId(row.slug);
          if (!want.has(sourceId)) continue;
          out.communities.set(sourceId, {
            kind: "community",
            slug: row.slug,
            display_name: row.display_name,
            tagline: row.tagline,
            bio: row.bio,
          });
        }
      })(),
    );
  }

  // ----- COMMUNITY_POSTS -----
  if (idsByTable.community_posts.length > 0) {
    tasks.push(
      (async () => {
        const { data } = await admin
          .from("community_posts")
          .select("id, artist_slug, title, body, created_at, moderation_status")
          .in("id", idsByTable.community_posts);
        for (const row of (data ?? []) as Array<{
          id: string;
          artist_slug: string;
          title: string | null;
          body: string;
          created_at: string;
          moderation_status: string | null;
        }>) {
          // Defensive: filter out auto_hide posts in case the embedding
          // exists but moderation flagged the row after.
          if (row.moderation_status === "auto_hide") continue;
          if (isPlaceholderDraftPost(row)) continue;
          out.community_posts.set(row.id, {
            kind: "post",
            id: row.id,
            artist_slug: row.artist_slug,
            title: row.title,
            body: row.body,
            created_at: row.created_at,
          });
        }
      })(),
    );
  }

  // ----- COMMUNITY_COMMENTS -----
  if (idsByTable.community_comments.length > 0) {
    tasks.push(
      (async () => {
        const { data } = await admin
          .from("community_comments")
          .select(
            "id, post_id, body, created_at, moderation_status, community_posts!inner(artist_slug)",
          )
          .in("id", idsByTable.community_comments);
        for (const row of (data ?? []) as unknown as Array<{
          id: string;
          post_id: string;
          body: string;
          created_at: string;
          moderation_status: string | null;
          community_posts: { artist_slug: string };
        }>) {
          if (row.moderation_status === "auto_hide") continue;
          out.community_comments.set(row.id, {
            kind: "comment",
            id: row.id,
            post_id: row.post_id,
            body: row.body,
            created_at: row.created_at,
            artist_slug: row.community_posts?.artist_slug ?? "",
          });
        }
      })(),
    );
  }

  // ----- ARTIST_EVENTS -----
  if (idsByTable.artist_events.length > 0) {
    tasks.push(
      (async () => {
        const { data } = await admin
          .from("artist_events")
          .select("id, artist_slug, title, detail, event_date, url, active")
          .in("id", idsByTable.artist_events);
        for (const row of (data ?? []) as Array<{
          id: string;
          artist_slug: string;
          title: string;
          detail: string | null;
          event_date: string | null;
          url: string | null;
          active: boolean;
        }>) {
          if (!row.active) continue;
          out.artist_events.set(row.id, {
            kind: "event",
            id: row.id,
            artist_slug: row.artist_slug,
            title: row.title,
            detail: row.detail,
            event_date: row.event_date,
            url: row.url,
          });
        }
      })(),
    );
  }

  // ----- REWARDS_CATALOG -----
  if (idsByTable.rewards_catalog.length > 0) {
    tasks.push(
      (async () => {
        const { data } = await admin
          .from("rewards_catalog")
          .select("id, community_id, title, description, point_cost, active")
          .in("id", idsByTable.rewards_catalog);
        for (const row of (data ?? []) as Array<{
          id: string;
          community_id: string;
          title: string;
          description: string | null;
          point_cost: number;
          active: boolean;
        }>) {
          if (!row.active) continue;
          out.rewards_catalog.set(row.id, {
            kind: "reward",
            id: row.id,
            community_id: row.community_id,
            title: row.title,
            description: row.description,
            point_cost: row.point_cost,
          });
        }
      })(),
    );
  }

  await Promise.all(tasks);
  return out;
}

function emptyResults(query: string, started: number): SearchResults {
  return {
    query,
    durationMs: Date.now() - started,
    totalHits: 0,
    missingSourceRows: 0,
    groups: {
      artists: [],
      fans: [],
      communities: [],
      posts: [],
      events: [],
      rewards: [],
      comments: [],
    },
  };
}
