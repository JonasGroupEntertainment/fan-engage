/**
 * Public surface of the embeddings module.
 *
 * Callers should import from "@/lib/embeddings", never from the individual
 * files. That way we can refactor internals without touching the rest of
 * the app.
 */

export {
  EMBED_MODEL,
  EMBED_DIMS,
  EmbeddingError,
  embedText,
  embedBatch,
  embedBatchWithIndex,
  normalizeForEmbedding,
  pgvectorLiteral,
} from "./client";

export {
  SOURCES,
  SOURCE_TABLES,
  type SourceTable,
  type Visibility,
  type SourceDescriptor,
  slugToSourceId,
  contentHash,
} from "./sources";

export {
  indexRow,
  indexRowAsync,
  type IndexResult,
} from "./index-row";

export {
  CONTENT_EMBEDDINGS_COMMUNITY_FK,
  isKnownCommunity,
  isMissingCommunityError,
  orphanSkipLog,
  partitionEmbeddingCandidates,
  selectEmbeddingWork,
} from "./orphans";

export {
  emptyBackfillSummary,
  noteIndexResult,
  noteSkippedOrphan,
  type BackfillSummary,
  type SkippedOrphan,
} from "./backfill-summary";
