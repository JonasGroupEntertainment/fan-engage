/**
 * Rows whose tenant slug is not a `communities.slug`.
 *
 * `content_embeddings.community_id` references `communities(slug)`. The
 * backfill copies `community_posts.artist_slug` and `artist_events.artist_slug`
 * into that column. Those source columns are not foreign keys, so a deleted
 * or never-created community leaves content that cannot be embedded.
 */

/** Postgres name of content_embeddings.community_id → communities.slug. */
export const CONTENT_EMBEDDINGS_COMMUNITY_FK =
  "content_embeddings_community_id_fkey";

export function isMissingCommunityError(message: string): boolean {
  return message.includes(CONTENT_EMBEDDINGS_COMMUNITY_FK);
}

export function isKnownCommunity(
  communityId: string | null | undefined,
  knownCommunitySlugs: ReadonlySet<string>,
): boolean {
  const slug = (communityId ?? "").trim();
  return slug.length > 0 && knownCommunitySlugs.has(slug);
}

export function partitionEmbeddingCandidates<T extends { community_id: string }>(
  rows: readonly T[],
  knownCommunitySlugs: ReadonlySet<string>,
): { embeddable: T[]; orphans: T[] } {
  const embeddable: T[] = [];
  const orphans: T[] = [];
  for (const row of rows) {
    if (isKnownCommunity(row.community_id, knownCommunitySlugs)) embeddable.push(row);
    else orphans.push(row);
  }
  return { embeddable, orphans };
}

/**
 * Drop orphan tenants, then cap the embeddable rows. Orphans must not
 * consume the batch or the valid rows behind them never get embedded.
 */
export function selectEmbeddingWork<T extends { community_id: string }>(
  rows: readonly T[],
  knownCommunitySlugs: ReadonlySet<string>,
  batchSize: number,
): { orphans: T[]; toEmbed: T[] } {
  const { embeddable, orphans } = partitionEmbeddingCandidates(
    rows,
    knownCommunitySlugs,
  );
  return { orphans, toEmbed: embeddable.slice(0, batchSize) };
}

export function orphanSkipLog(input: {
  table: string;
  rowId: string;
  communityId: string;
}): string {
  return `[embeddings] skip orphan ${input.table}/${input.rowId}: community "${input.communityId}" does not exist`;
}
