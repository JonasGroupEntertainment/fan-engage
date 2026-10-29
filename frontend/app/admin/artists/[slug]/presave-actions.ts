"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import {
  PRESAVE_ACTION_KIND,
  normalizePresavePoints,
  normalizePresaveUrl,
  parseReleaseDate,
} from "@/lib/presave/core";

/**
 * Pre-save CRUD for /admin/artists/[slug]. Gated exactly like events
 * (authorizeAdmin community admin role). Rows live in fan_actions with
 * kind = 'pre_save' — see lib/presave/core.ts for the storage decision.
 */
const EDIT_ROLE = "admin" as const;

type Result = { success: true } | { error: string };

function revalidate(artistSlug: string) {
  revalidatePath(`/admin/artists/${artistSlug}`);
  revalidatePath(`/artists/${artistSlug}`);
  revalidatePath(`/artists/${artistSlug}/community`);
}

function releaseDateFromForm(formData: FormData): { ok: true; value: string | null } | { ok: false; error: string } {
  const raw = String(formData.get("release_date") ?? "").trim();
  if (!raw) return { ok: true, value: null };
  if (!parseReleaseDate(raw)) return { ok: false, error: "Release date must be YYYY-MM-DD." };
  return { ok: true, value: raw.slice(0, 10) };
}

function isMissingReleaseDate(err: { message?: string } | null): boolean {
  return /release_date/i.test(err?.message ?? "");
}

const RELEASE_DATE_MIGRATION_ERROR =
  "Apply migration 0091_presave_and_ai_gates.sql before setting a release date. It is not applied yet.";

export async function createPresaveAction(formData: FormData): Promise<Result> {
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const url = normalizePresaveUrl(String(formData.get("url") ?? ""));
  if (!artistSlug || !title) return { error: "Title is required." };
  if (!url) return { error: "A Spotify / Apple / linkfire URL (https://…) is required." };
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: EDIT_ROLE });
  if (!guard.ok) return { error: "You do not manage this artist." };

  const release = releaseDateFromForm(formData);
  if (!release.ok) return { error: release.error };
  const description = String(formData.get("description") ?? "").trim();
  const points = normalizePresavePoints(String(formData.get("points") ?? ""));
  const active = String(formData.get("active") ?? "true") !== "false";

  const row = {
    artist_slug: artistSlug,
    community_id: artistSlug,
    kind: PRESAVE_ACTION_KIND,
    title,
    description: description || null,
    url,
    cta_label: `Pre-save ${title}`.slice(0, 60),
    point_value: points,
    active,
  };
  const supa = createAdminClient();
  let { error } = await supa.from("fan_actions").insert({ ...row, release_date: release.value });
  if (error && isMissingReleaseDate(error)) {
    if (release.value) return { error: RELEASE_DATE_MIGRATION_ERROR };
    ({ error } = await supa.from("fan_actions").insert(row));
  }
  if (error) return { error: error.message };
  revalidate(artistSlug);
  return { success: true };
}

export async function updatePresaveAction(formData: FormData): Promise<Result> {
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const id = String(formData.get("action_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const url = normalizePresaveUrl(String(formData.get("url") ?? ""));
  if (!artistSlug || !id || !title) return { error: "Title is required." };
  if (!url) return { error: "A Spotify / Apple / linkfire URL (https://…) is required." };
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: EDIT_ROLE });
  if (!guard.ok) return { error: "You do not manage this artist." };

  const release = releaseDateFromForm(formData);
  if (!release.ok) return { error: release.error };
  const description = String(formData.get("description") ?? "").trim();
  const points = normalizePresavePoints(String(formData.get("points") ?? ""));
  const active = String(formData.get("active") ?? "") === "true";

  const patch = {
    title,
    description: description || null,
    url,
    cta_label: `Pre-save ${title}`.slice(0, 60),
    point_value: points,
    active,
  };
  const supa = createAdminClient();
  const scope = () =>
    supa
      .from("fan_actions")
      .update({ ...patch, release_date: release.value })
      .eq("id", id)
      .eq("artist_slug", artistSlug)
      .eq("kind", PRESAVE_ACTION_KIND);
  let { error } = await scope();
  if (error && isMissingReleaseDate(error)) {
    if (release.value) return { error: RELEASE_DATE_MIGRATION_ERROR };
    ({ error } = await supa
      .from("fan_actions")
      .update(patch)
      .eq("id", id)
      .eq("artist_slug", artistSlug)
      .eq("kind", PRESAVE_ACTION_KIND));
  }
  if (error) return { error: error.message };
  revalidate(artistSlug);
  return { success: true };
}

/** Deactivate rather than delete — completions and ledger rows reference the id. */
export async function togglePresaveActiveAction(formData: FormData): Promise<Result> {
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const id = String(formData.get("action_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!artistSlug || !id) return { error: "Missing pre-save." };
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: EDIT_ROLE });
  if (!guard.ok) return { error: "You do not manage this artist." };
  const { error } = await createAdminClient()
    .from("fan_actions")
    .update({ active })
    .eq("id", id)
    .eq("artist_slug", artistSlug)
    .eq("kind", PRESAVE_ACTION_KIND);
  if (error) return { error: error.message };
  revalidate(artistSlug);
  return { success: true };
}
