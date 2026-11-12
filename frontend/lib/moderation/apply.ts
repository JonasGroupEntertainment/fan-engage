/**
 * Shared, pure helpers for the moderation override actions.
 *
 * Two server-action files drive the same queue — /admin/moderation (JG
 * staff, gated by lib/admin-guard) and /artist-portal/moderation (artist
 * teams, gated by lib/artist-portal/access). Both parse the same form,
 * make the same "may this row be changed to that status" decision and
 * then call applyAdminOverride (./moderate-row). Keeping the parse +
 * decide steps here means the two files cannot drift on what counts as a
 * valid table, status or scope.
 *
 * No I/O and no "@/…" imports: this module is unit tested with node:test
 * (see ./apply.test.ts), which cannot resolve path aliases.
 */

import type { ModerateSourceTable } from "./moderate-row";

/** Statuses an admin/team override may set. */
export type ModerationOverrideStatus = "safe" | "flag_review" | "auto_hide";

/** Button → status map. Both queues render the same three buttons. */
export const OVERRIDE_ACTION_STATUS = {
  approve: "safe",
  hide: "auto_hide",
  requeue: "flag_review",
} as const satisfies Record<string, ModerationOverrideStatus>;

export const MODERATION_SOURCE_TABLES: readonly ModerateSourceTable[] = [
  "community_posts",
  "community_comments",
];

export function isModerationSourceTable(
  value: string,
): value is ModerateSourceTable {
  return (MODERATION_SOURCE_TABLES as readonly string[]).includes(value);
}

export interface ParsedOverrideForm {
  table: ModerateSourceTable;
  rowId: string;
  notes?: string;
}

/**
 * Reads the hidden fields the queue cards submit. Returns null when the
 * table is not a moderated table or the row id is missing — the action
 * then silently no-ops, matching the pre-existing admin behaviour.
 */
export function parseOverrideForm(form: {
  get(name: string): FormDataEntryValue | null;
}): ParsedOverrideForm | null {
  const table = String(form.get("table") ?? "");
  const rowId = String(form.get("row_id") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim() || undefined;
  if (!rowId || !isModerationSourceTable(table)) return null;
  return { table, rowId, notes };
}

export type OverrideDecision =
  | { ok: true; communityId: string }
  | {
      ok: false;
      reason: "row_not_found" | "out_of_scope" | "invalid_status";
    };

/**
 * Decide whether an override may proceed.
 *
 *   rowCommunityId   — the community that owns the row, loaded from the
 *                      database (lib/community-owner), never from the form.
 *   scopeCommunityId — the community the caller is allowed to act on, or
 *                      null for a super-admin acting anywhere.
 *
 * Portal callers always pass ctx.communityId as the scope, so a team can
 * only ever touch rows in its own community even if a row id from another
 * community is submitted.
 */
export function decideOverride(args: {
  rowCommunityId: string | null | undefined;
  scopeCommunityId: string | null;
  newStatus: string;
}): OverrideDecision {
  if (!isOverrideStatus(args.newStatus)) {
    return { ok: false, reason: "invalid_status" };
  }
  if (!args.rowCommunityId) return { ok: false, reason: "row_not_found" };
  if (args.scopeCommunityId !== null && args.scopeCommunityId !== args.rowCommunityId) {
    return { ok: false, reason: "out_of_scope" };
  }
  return { ok: true, communityId: args.rowCommunityId };
}

export function isOverrideStatus(value: string): value is ModerationOverrideStatus {
  return value === "safe" || value === "flag_review" || value === "auto_hide";
}

/* ------------------------------------------------------------------ */
/* Queue ordering                                                       */
/* ------------------------------------------------------------------ */

/** Statuses that belong in a human review queue. */
export const QUEUE_STATUSES = ["pending", "flag_review", "auto_hide"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export interface QueueSortable {
  status: string;
  self_harm: boolean;
  classified_at: string | null;
  created_at: string;
}

const STATUS_RANK: Record<string, number> = {
  auto_hide: 0,
  flag_review: 1,
  pending: 2,
};

/**
 * Comparator shared by the queues: self-harm signals first (they must
 * never be buried), then auto-hidden, then flagged, then still-pending
 * rows; within a bucket newest classification first, falling back to
 * post time for rows the classifier has not reached yet.
 */
export function compareQueueRows(a: QueueSortable, b: QueueSortable): number {
  if (a.self_harm !== b.self_harm) return a.self_harm ? -1 : 1;
  const ra = STATUS_RANK[a.status] ?? 9;
  const rb = STATUS_RANK[b.status] ?? 9;
  if (ra !== rb) return ra - rb;
  const ta = a.classified_at ?? a.created_at;
  const tb = b.classified_at ?? b.created_at;
  return tb.localeCompare(ta);
}

export function countQueue<T extends QueueSortable>(rows: readonly T[]) {
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    flag_review: rows.filter((r) => r.status === "flag_review").length,
    auto_hide: rows.filter((r) => r.status === "auto_hide").length,
    self_harm: rows.filter((r) => r.self_harm).length,
  };
}
