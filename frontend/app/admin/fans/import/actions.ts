"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import { getAdminContext } from "@/lib/admin";
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

export interface ImportCommunityOption {
  slug: string;
  label: string;
}

/**
 * Communities the signed-in admin may import into, read from the
 * `communities` table (never a hard-coded artist list). Super-admins see
 * every row; community admins only their grants. Inactive pools stay
 * listed — importing is how a pool gets seeded before launch.
 */
export async function listImportCommunitiesAction(): Promise<ImportCommunityOption[]> {
  const ctx = await getAdminContext();
  if (!ctx) throw new Error("Unauthorized");
  let query = createAdminClient()
    .from("communities")
    .select("slug, display_name, active, sort_order")
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });
  if (!ctx.isSuperAdmin) {
    if (ctx.communities.length === 0) return [];
    query = query.in("slug", ctx.communities);
  }
  const { data, error } = await query;
  if (error) throw new Error("Could not load communities");
  return ((data ?? []) as Array<{ slug: string; display_name: string | null; active: boolean }>).map(
    (c) => ({
      slug: c.slug,
      label: `${c.display_name ?? c.slug}${c.active ? "" : " (inactive)"}`,
    }),
  );
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
