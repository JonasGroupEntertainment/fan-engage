import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFanImportPatch,
  normalizeImportEmail,
  type ExistingFanFields,
  type FanImportRow,
} from "./import-patch.ts";

/**
 * Server-side CSV fan import shared by the admin API route and the admin
 * server action. Callers must run the admin guard for `communityId` first.
 *
 * Existing fans only get blank fields filled in. New fans get an auth user
 * (no email sent) and a fans row. Every imported fan gets a membership in
 * `communityId` (existing memberships are left alone).
 */

export interface ImportRowInput extends FanImportRow {
  _rowIndex?: number;
}

export interface FanImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; email: string; reason: string }[];
}

type RowOutcome =
  | { kind: "created" | "updated" | "unchanged"; fanId: string }
  | { kind: "error"; reason: string };

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers();
  return data?.users?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}

async function importExistingFan(
  admin: SupabaseClient,
  existing: ExistingFanFields & { id: string },
  row: FanImportRow,
): Promise<RowOutcome> {
  const patch = buildFanImportPatch(existing, row);
  if (Object.keys(patch).length === 0) return { kind: "unchanged", fanId: existing.id };
  const { error } = await admin.from("fans").update(patch).eq("id", existing.id);
  if (error) return { kind: "error", reason: error.message };
  return { kind: "updated", fanId: existing.id };
}

async function importNewFan(
  admin: SupabaseClient,
  email: string,
  row: FanImportRow,
): Promise<RowOutcome> {
  let authUserId: string | null = null;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (authError) {
    // The auth user may already exist without a fans row.
    authUserId = await findAuthUserIdByEmail(admin, email);
    if (!authUserId) return { kind: "error", reason: authError.message };
  } else {
    authUserId = authData.user.id;
  }

  // ignoreDuplicates: never overwrite a fans row that already has this id.
  const { error } = await admin
    .from("fans")
    .upsert(
      { id: authUserId, email, ...buildFanImportPatch(null, row) },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) return { kind: "error", reason: error.message };
  return { kind: "created", fanId: authUserId };
}

export async function importFanRows(
  admin: SupabaseClient,
  rows: ImportRowInput[],
  communityId: string,
): Promise<FanImportResult> {
  const result: FanImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {};
    const rowNumber = typeof row._rowIndex === "number" ? row._rowIndex : i + 2;
    const email = normalizeImportEmail(row.email);
    if (!email) {
      result.errors.push({ row: rowNumber, email: String(row.email ?? ""), reason: "Invalid email" });
      result.skipped++;
      continue;
    }

    const { data: existing } = await admin
      .from("fans")
      .select("id, first_name, phone, city, socials")
      .eq("email", email)
      .maybeSingle();

    const outcome = existing
      ? await importExistingFan(admin, existing as ExistingFanFields & { id: string }, row)
      : await importNewFan(admin, email, row);

    if (outcome.kind === "error") {
      result.errors.push({ row: rowNumber, email, reason: outcome.reason });
      result.skipped++;
      continue;
    }
    if (outcome.kind === "created") result.created++;
    else result.updated++;

    await admin.from("fan_community_memberships").upsert(
      {
        fan_id: outcome.fanId,
        community_id: communityId,
        total_points: 0,
        current_tier: "bronze",
        status: "active",
        joined_at: new Date().toISOString(),
      },
      { onConflict: "fan_id,community_id", ignoreDuplicates: true },
    );
  }

  return result;
}
