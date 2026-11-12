/**
 * Pure summary updates for the embeddings backfill cron.
 *
 * Orphan community references are recorded on `skippedOrphans` and must
 * not land in `errors`. `runCron` treats `summary.errors` as a failed
 * invocation, which previously failed every tick on the same rows.
 */

import type { IndexResult } from "./index-row";
import type { SourceTable } from "./sources";

export interface SkippedOrphan {
  table: SourceTable;
  rowId: string;
  communityId: string;
}

export interface BackfillSummary {
  totalCandidates: number;
  processed: number;
  byStatus: Record<string, number>;
  byTable: Partial<Record<SourceTable, number>>;
  skippedOrphans: SkippedOrphan[];
  errors: Array<{ table: SourceTable; rowId: string; error: string }>;
  durationMs: number;
}

export function emptyBackfillSummary(): BackfillSummary {
  return {
    totalCandidates: 0,
    processed: 0,
    byStatus: {},
    byTable: {},
    skippedOrphans: [],
    errors: [],
    durationMs: 0,
  };
}

export function noteSkippedOrphan(
  summary: BackfillSummary,
  item: SkippedOrphan,
): void {
  summary.skippedOrphans.push(item);
  summary.byStatus.skipped_orphan = (summary.byStatus.skipped_orphan ?? 0) + 1;
  summary.byTable[item.table] = (summary.byTable[item.table] ?? 0) + 1;
}

/** Record one indexRow outcome. Orphans stay out of `errors`. */
export function noteIndexResult(
  summary: BackfillSummary,
  table: SourceTable,
  rowId: string,
  result: IndexResult,
): void {
  summary.processed += 1;
  summary.byStatus[result.status] = (summary.byStatus[result.status] ?? 0) + 1;
  summary.byTable[table] = (summary.byTable[table] ?? 0) + 1;
  if (result.status === "skipped_orphan") {
    summary.skippedOrphans.push({
      table,
      rowId,
      communityId: result.communityId,
    });
    return;
  }
  if (result.status === "error") {
    summary.errors.push({ table, rowId, error: result.error });
  }
}
