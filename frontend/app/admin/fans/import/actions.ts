"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import { importFanRows } from "@/lib/fans/import-fans";
import { MAX_IMPORT_ROWS_PER_REQUEST } from "@/lib/fans/import-patch";

export interface ImportRow {
  email: string;
  first_name?: string;
  phone?: string;
  instagram?: string;
  tiktok?: string;
  city?: string;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; email: string; reason: string }[];
}

/**
 * Imports fans from a parsed CSV into one community the caller administers.
 * Matches on email. Existing fans only get blank fields filled in, never
 * overwritten. New fans get an auth user (no email sent) and a fans row.
 * Every imported fan gets a membership in `communityId`.
 */
export async function importFansAction(
  rows: ImportRow[],
  communityId: string,
): Promise<ImportResult> {
  const target = typeof communityId === "string" ? communityId.trim() : "";
  if (!target) throw new Error("Choose a community to import into.");

  const guard = await authorizeAdmin({ communityId: target, minRole: "admin" });
  if (!guard.ok) throw new Error(guard.reason === "signed_out" ? "Unauthorized" : "Forbidden");

  if (!Array.isArray(rows)) throw new Error("rows must be an array");
  if (rows.length > MAX_IMPORT_ROWS_PER_REQUEST) {
    throw new Error(`Send at most ${MAX_IMPORT_ROWS_PER_REQUEST} rows per request.`);
  }

  const result = await importFanRows(createAdminClient(), rows, target);
  return { total: rows.length, ...result };
}
