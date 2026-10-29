"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPortalRole } from "@/lib/artist-portal/access";
import { isMissingEventGeoColumn } from "@/lib/data/event-select";
import {
  buildEventRow,
  buildStartsAt,
  formatEventDisplayDate,
} from "@/lib/events/build-event-row";
import { parseTourList, type ParsedEvent, type ParseError } from "@/lib/events/parse-tour-list";
import { eventDayKey } from "@/lib/today/event-day";

/**
 * Editors and above may manage events (PORTAL_MIN_ROLE.events). Throws
 * "Unauthorized" / "Forbidden" rather than redirecting. Writes go through
 * the service role because artist_events has no RLS write policies —
 * the role check above is the authorization.
 */
async function requireEditor() {
  const ctx = await assertPortalRole("events");
  return { supabase: createAdminClient(), communityId: ctx.communityId };
}

export async function createPortalEventAction(formData: FormData) {
  const { supabase, communityId } = await requireEditor();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const detail = String(formData.get("detail") ?? "").trim();
  const eventDate = String(formData.get("event_date") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;

  const { error } = await supabase.from("artist_events").insert({
    artist_slug: communityId,
    community_id: communityId,
    title,
    detail: detail || null,
    event_date: eventDate || null,
    starts_at: startsAt || null,
    location: location || null,
    url: url || null,
    capacity: Number.isFinite(capacity) ? capacity : null,
    sort_order: 0,
  });

  if (error) return { error: error.message };

  revalidatePath("/artist-portal/events");
  revalidatePath(`/artists/${communityId}`);
  return { success: true as const };
}

export async function updatePortalEventAction(formData: FormData) {
  const { supabase, communityId } = await requireEditor();

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) return { error: "Missing event_id." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const detail = String(formData.get("detail") ?? "").trim();
  const eventDate = String(formData.get("event_date") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;
  const active = String(formData.get("active") ?? "") === "true";

  const { error } = await supabase
    .from("artist_events")
    .update({
      title,
      detail: detail || null,
      event_date: eventDate || null,
      starts_at: startsAt || null,
      location: location || null,
      url: url || null,
      capacity: Number.isFinite(capacity) ? capacity : null,
      active,
    })
    .eq("id", eventId)
    .eq("community_id", communityId);

  if (error) return { error: error.message };

  revalidatePath("/artist-portal/events");
  revalidatePath(`/artists/${communityId}`);
  return { success: true as const };
}

export async function deletePortalEventAction(formData: FormData) {
  const { supabase, communityId } = await requireEditor();

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) return;

  await supabase
    .from("artist_events")
    .delete()
    .eq("id", eventId)
    .eq("community_id", communityId);

  revalidatePath("/artist-portal/events");
  revalidatePath(`/artists/${communityId}`);
}

/* ─── Tour-list bulk import ───────────────────────────────────────────── */

export interface TourListPreview {
  rows: ParsedEvent[];
  errors: ParseError[];
  /** Lines (1-based) that already exist for this artist as (title, event_date). */
  existing: number[];
}

/** Max lines accepted in one paste — a tour is dozens of dates, not thousands. */
const MAX_TOUR_LINES = 200;

/**
 * Parse a pasted tour list without writing anything. Returns the rows the
 * importer would create (coordinates already resolved from the US city
 * table), the lines it could not read, and which rows already exist for
 * this artist so the preview can mark them "will skip".
 */
export async function previewTourListAction(text: string): Promise<TourListPreview | { error: string }> {
  const { supabase, communityId } = await requireEditor();
  const clean = String(text ?? "");
  if (clean.split("\n").length > MAX_TOUR_LINES) {
    return { error: `Paste at most ${MAX_TOUR_LINES} lines at a time.` };
  }
  const parsed = parseTourList(clean);
  const existing = await findExistingLines(supabase, communityId, parsed.rows);
  return { rows: parsed.rows, errors: parsed.errors, existing };
}

export interface BulkCreateResult {
  created: number;
  skipped: number;
  unparsed: number;
}

/**
 * Create one artist_events row per parsed line. Rows whose (title,
 * event_date) already exist for the artist are skipped, as are lines that
 * did not parse. Rows are built with the same helpers as the single-event
 * forms (lib/events/build-event-row.ts): title = venue, location =
 * "City, ST", event_date = "Mar 14, 2026 · 7:30 PM", starts_at =
 * "YYYY-MM-DDTHH:MM" only when a time was given, plus the 0090
 * city/region/lat/lng columns. sort_order runs sequentially after the
 * artist's current maximum.
 */
export async function bulkCreateEventsAction(
  text: string,
): Promise<BulkCreateResult | { error: string }> {
  const { supabase, communityId } = await requireEditor();
  const clean = String(text ?? "");
  if (clean.split("\n").length > MAX_TOUR_LINES) {
    return { error: `Paste at most ${MAX_TOUR_LINES} lines at a time.` };
  }
  const parsed = parseTourList(clean);
  const existing = new Set(await findExistingLines(supabase, communityId, parsed.rows));
  const fresh = parsed.rows.filter((r) => !existing.has(r.line));
  if (fresh.length === 0) {
    return { created: 0, skipped: existing.size, unparsed: parsed.errors.length };
  }

  const { data: maxRow } = await supabase
    .from("artist_events")
    .select("sort_order")
    .eq("community_id", communityId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextSort = ((maxRow?.sort_order as number | null) ?? 0) + 1;

  const base = fresh.map((r) => ({
    artist_slug: communityId,
    community_id: communityId,
    active: true,
    ...buildEventRow({
      title: r.venue,
      detail: r.detail,
      eventDate: formatEventDisplayDate(r.date, r.time),
      startsAt: buildStartsAt(r.date, r.time),
      location: r.location,
      url: r.url,
      sortOrder: nextSort++,
    }),
  }));
  const withGeo = base.map((row, i) => ({
    ...row,
    city: fresh[i].city,
    region: fresh[i].region,
    lat: fresh[i].lat,
    lng: fresh[i].lng,
  }));

  let { error } = await supabase.from("artist_events").insert(withGeo);
  if (error && isMissingEventGeoColumn(error)) {
    // Migration 0090 not applied yet: save without the venue location.
    ({ error } = await supabase.from("artist_events").insert(base));
  }
  if (error) return { error: error.message };

  revalidatePath("/artist-portal/events");
  revalidatePath("/artist-portal/launch");
  revalidatePath(`/artists/${communityId}`);
  return { created: fresh.length, skipped: existing.size, unparsed: parsed.errors.length };
}

/**
 * Which parsed lines collide with an existing (title, day) for the artist.
 * The day comes from eventDayKey (starts_at, else the parsed event_date
 * text), so "Mar 14, 2026" and "Mar 14, 2026 · 7:30 PM" are the same show
 * and re-pasting a list is a no-op. Titles compare case-insensitively.
 */
async function findExistingLines(
  supabase: ReturnType<typeof createAdminClient>,
  communityId: string,
  rows: ParsedEvent[],
): Promise<number[]> {
  if (rows.length === 0) return [];
  // An artist has dozens of events at most; fetch them all so the title
  // match can be case-insensitive without an ilike per row.
  const { data } = await supabase
    .from("artist_events")
    .select("title, event_date, starts_at")
    .eq("community_id", communityId);
  const have = new Set(
    ((data ?? []) as Array<{ title: string; event_date: string | null; starts_at: string | null }>).map(
      (e) => `${e.title.toLowerCase()}|${eventDayKey(e) ?? e.event_date ?? ""}`,
    ),
  );
  return rows.filter((r) => have.has(`${r.venue.toLowerCase()}|${r.date}`)).map((r) => r.line);
}
