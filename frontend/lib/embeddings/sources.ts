/**
 * Source-table registry for the embedding pipeline.
 *
 * Each "source" describes one of the text-bearing tables in Fan Engage that
 * we want to embed. The registry tells the indexer:
 *
 *   1. How to assemble the embeddable text from the source row's columns
 *      (e.g. for community_posts: title + body; for communities: bio +
 *      tagline).
 *   2. How to derive the (community_id, visibility) tenant/access metadata
 *      that gets mirrored into the content_embeddings row.
 *   3. The content_embeddings.source_id format. For uuid-keyed tables it's
 *      just the row's id; for `communities` (slug-keyed) we use a
 *      deterministic uuid derived from md5('community:' || slug) — same
 *      formula as `list_unembedded_rows()` in migration 0024.
 *
 * Adding a new embeddable table = adding one entry to SOURCES below.
 *
 * NOTE on the music-platform schema:
 *   * community_posts.visibility is ('public' | 'premium' | 'founder-only')
 *   * artist_events keys by artist_slug, which equals communities.slug for
 *     all 5 music tenants from migration 0011. We pass artist_slug as the
 *     community_id when storing the embedding.
 *   * The `offers` table has no community_id (it's global) so it's
 *     intentionally NOT in this registry. Add later via a small schema
 *     change.
 */

import crypto from "node:crypto";

/** What content_embeddings.source_table allows. Must match the SQL CHECK
 *  constraint in migration 0024. */
export type SourceTable =
  | "community_posts"
  | "community_comments"
  | "communities"
  | "artist_events"
  | "rewards_catalog";

/** What content_embeddings.visibility allows. Must match the SQL CHECK. */
export type Visibility = "public" | "premium" | "founder-only" | "private";

/** Describes one source table for the embedding indexer. */
export interface SourceDescriptor {
  /** Logical name used in content_embeddings.source_table. */
  table: SourceTable;
  /**
   * Columns to fetch from this table when (re)indexing a row. Must include
   * everything `buildText` and `extractMeta` need.
   */
  columns: string;
  /** Build the embeddable text from a row of this table. */
  buildText(row: Record<string, unknown>): string;
  /**
   * Map a source row to the tenant + access metadata that gets stored on
   * the content_embeddings row.
   */
  extractMeta(row: Record<string, unknown>): {
    community_id: string;
    visibility: Visibility;
    /** UUID to write into content_embeddings.source_id. */
    source_id: string;
  };
}

/** Convert a slug to a stable uuid for the content_embeddings.source_id
 *  column. communities is the only source table that doesn't have native
 *  uuid keys — it's keyed by a text slug. We derive a deterministic uuid
 *  from md5('community:' || slug) so the value is reproducible across
 *  inline-indexing calls and the backfill cron. The same formula appears
 *  in list_unembedded_rows() inside migration 0024 — keep them in sync. */
export function slugToSourceId(slug: string): string {
  const hex = crypto
    .createHash("md5")
    .update(`community:${slug}`)
    .digest("hex");
  // Format as a uuid: 8-4-4-4-12.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** SHA-256 of the embeddable text. Used to skip re-embedding when nothing
 *  meaningful changed. The hash matches what's stored in
 *  content_embeddings.content_hash. */
export function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Map a community_posts.visibility ('public' | 'premium' | 'founder-only')
 * to the content_embeddings.visibility space. Identity for the values that
 * exist; falls back to 'public' for anything unrecognized.
 */
function postVisibility(row: Record<string, unknown>): Visibility {
  const v = String(row.visibility ?? "public");
  if (v === "premium") return "premium";
  if (v === "founder-only") return "founder-only";
  return "public";
}

/** The registry. */
export const SOURCES: Record<SourceTable, SourceDescriptor> = {
  community_posts: {
    table: "community_posts",
    // Fan Engage's community_posts uses artist_slug (not the community_id
    // column) as the embedding tenant. Migration 0011 copied artist_slug
    // into community_id, but later seed rows can disagree.
    columns: "id, artist_slug, title, body, visibility",
    buildText: (row) =>
      [row.title, row.body]
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .join("\n\n"),
    // artist_slug is stored as content_embeddings.community_id. It has to
    // be a communities.slug; community_posts.community_id is a different
    // column and is not the tenant key for this pipeline.
    extractMeta: (row) => ({
      community_id: String(row.artist_slug ?? ""),
      visibility: postVisibility(row),
      source_id: String(row.id),
    }),
  },

  community_comments: {
    table: "community_comments",
    // community_comments has no visibility or community_id columns of its
    // own — both are inherited from the parent post. The indexer joins
    // through community_posts and provides them on the row passed in here.
    columns: "id, post_id, body",
    buildText: (row) => String(row.body ?? ""),
    extractMeta: (row) => ({
      community_id: String(row.community_id ?? row.artist_slug),
      visibility: postVisibility(row),
      source_id: String(row.id),
    }),
  },

  communities: {
    table: "communities",
    columns: "slug, display_name, tagline, bio, type",
    buildText: (row) => {
      const parts: string[] = [];
      if (row.display_name) parts.push(String(row.display_name));
      if (row.tagline) parts.push(String(row.tagline));
      if (row.bio) parts.push(String(row.bio));
      return parts.join("\n\n");
    },
    extractMeta: (row) => ({
      community_id: String(row.slug),
      visibility: "public",
      source_id: slugToSourceId(String(row.slug)),
    }),
  },

  artist_events: {
    table: "artist_events",
    // Fan Engage's artist_events is the music-era schema: artist_slug,
    // title, detail, event_date (free-form text), url. No location or
    // tier columns in this version — events are public to all members.
    columns: "id, artist_slug, title, detail, event_date",
    buildText: (row) => {
      const parts: string[] = [];
      if (row.title) parts.push(String(row.title));
      if (row.event_date) parts.push(`Date: ${row.event_date}`);
      if (row.detail) parts.push(String(row.detail));
      return parts.join("\n\n");
    },
    extractMeta: (row) => ({
      community_id: String(row.artist_slug),
      visibility: "public",
      source_id: String(row.id),
    }),
  },

  rewards_catalog: {
    table: "rewards_catalog",
    columns: "id, community_id, title, description, requires_tier",
    buildText: (row) => {
      const parts: string[] = [];
      if (row.title) parts.push(String(row.title));
      if (row.description) parts.push(String(row.description));
      return parts.join("\n\n");
    },
    extractMeta: (row) => {
      // requires_tier maps onto our visibility space:
      //   null            → 'public' (any member can see + redeem)
      //   'premium'       → 'premium'
      //   'founder-only'  → 'founder-only'
      const tier = row.requires_tier as string | null;
      const visibility: Visibility =
        tier === "premium" ? "premium"
        : tier === "founder-only" ? "founder-only"
        : "public";
      return {
        community_id: String(row.community_id),
        visibility,
        source_id: String(row.id),
      };
    },
  },
};

/** All source tables in deterministic order — used by the backfill cron. */
export const SOURCE_TABLES: SourceTable[] = [
  "community_posts",
  "community_comments",
  "communities",
  "artist_events",
  "rewards_catalog",
];
