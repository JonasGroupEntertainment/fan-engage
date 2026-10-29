import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRESAVE_ACTION_KIND, isPresaveLive, presaveReleaseLabel } from "./core";

/** What the fan-facing card needs. Serialisable (crosses to a client component). */
export interface PresaveCardRow {
  id: string;
  title: string;
  description: string | null;
  url: string;
  cta_label: string;
  point_value: number;
  release_date: string | null;
  release_label: string | null;
  completed: boolean;
}

/** Admin list row — includes inactive / expired so the manager can edit them. */
export interface PresaveAdminRow {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  point_value: number;
  release_date: string | null;
  active: boolean;
  live: boolean;
  completions: number;
  created_at: string;
}

type RawRow = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  cta_label: string | null;
  point_value: number | null;
  release_date?: string | null;
  active: boolean | null;
  ends_at: string | null;
  created_at: string;
};

/** 0091 not applied yet → the column is missing; read without it. */
function isMissingReleaseDate(err: { message?: string } | null | undefined): boolean {
  return /release_date/i.test(err?.message ?? "") && /column|schema cache/i.test(err?.message ?? "");
}

async function listPresaveRows(artistSlug: string, onlyActive: boolean): Promise<RawRow[]> {
  const admin = createAdminClient();
  const base = () =>
    admin
      .from("fan_actions")
      .select("id,title,description,url,cta_label,point_value,release_date,active,ends_at,created_at")
      .eq("artist_slug", artistSlug)
      .eq("kind", PRESAVE_ACTION_KIND)
      .order("sort_order")
      .order("created_at", { ascending: false });
  let query = base();
  if (onlyActive) query = query.eq("active", true);
  const { data, error } = await query;
  if (!error) return (data ?? []) as RawRow[];
  if (!isMissingReleaseDate(error)) throw error;
  let fallback = admin
    .from("fan_actions")
    .select("id,title,description,url,cta_label,point_value,active,ends_at,created_at")
    .eq("artist_slug", artistSlug)
    .eq("kind", PRESAVE_ACTION_KIND)
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (onlyActive) fallback = fallback.eq("active", true);
  const { data: rows, error: err2 } = await fallback;
  if (err2) throw err2;
  return ((rows ?? []) as RawRow[]).map((r) => ({ ...r, release_date: null }));
}

/**
 * Live pre-saves for an artist plus whether the current viewer already
 * clicked through. Reads with the service role so the public artist page
 * shows the card to signed-out visitors too (fan_actions RLS is
 * authenticated-only until 0091). Never throws — the card is optional.
 */
export const getLivePresavesForArtist = cache(async function getLivePresavesForArtist(
  artistSlug: string,
): Promise<PresaveCardRow[]> {
  try {
    const now = new Date();
    const rows = (await listPresaveRows(artistSlug, true)).filter(
      (r) => !!r.url && isPresaveLive(r, now),
    );
    if (rows.length === 0) return [];

    let done = new Set<string>();
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("fan_action_completions")
          .select("action_id")
          .eq("fan_id", user.id)
          .in(
            "action_id",
            rows.map((r) => r.id),
          );
        done = new Set((data ?? []).map((d) => d.action_id as string));
      }
    } catch {
      // Signed-out or cookies unavailable — every card shows as not done.
    }

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      url: r.url as string,
      cta_label: r.cta_label?.trim() || `Pre-save ${r.title}`,
      point_value: r.point_value ?? 0,
      release_date: r.release_date ?? null,
      release_label: presaveReleaseLabel(r.release_date ?? null, now),
      completed: done.has(r.id),
    }));
  } catch (err) {
    console.warn("[presave] read failed (card hidden)", err);
    return [];
  }
});

/** Every pre-save row for the admin manager, with click-through counts. */
export async function listPresavesForAdmin(artistSlug: string): Promise<PresaveAdminRow[]> {
  const rows = await listPresaveRows(artistSlug, false);
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const { data: completions } = await admin
    .from("fan_action_completions")
    .select("action_id")
    .in(
      "action_id",
      rows.map((r) => r.id),
    );
  const counts = new Map<string, number>();
  for (const c of completions ?? []) {
    const id = c.action_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    url: r.url,
    point_value: r.point_value ?? 0,
    release_date: r.release_date ?? null,
    active: r.active ?? false,
    live: !!r.url && isPresaveLive(r, now),
    completions: counts.get(r.id) ?? 0,
    created_at: r.created_at,
  }));
}
