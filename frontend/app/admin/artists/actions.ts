"use server";

import { buildEventRow, resolveEventGeo } from "@/lib/events/build-event-row";
import { isMissingEventGeoColumn } from "@/lib/data/event-select";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin, assertAdmin } from "@/lib/admin-guard";
import { sendEventReminder, type ReminderWindowEvent } from "@/lib/reminders";
import { parseSocialLines } from "@/lib/socials/parse";
import { isMissingRsvpOpensColumn } from "@/lib/rsvp-window";

const RSVP_OPENS_MIGRATION_ERROR =
  "Apply migration 0079_founding_rsvp_window.sql before setting an RSVP open time. It is not applied yet.";

/** Blank clears the schedule (RSVP stays open). A value is stored as UTC. */
function rsvpOpensAtFromForm(
  formData: FormData,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const raw = String(formData.get("rsvp_opens_at") ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "RSVP open time is not a valid date." };
  }
  return { ok: true, value: parsed.toISOString() };
}

const EDIT_ROLE = "admin" as const;

/** Loads the artist an event belongs to, so by-id writes are scoped by the DB row. */
async function loadEventArtist(eventId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("artist_events")
    .select("artist_slug")
    .eq("id", eventId)
    .maybeSingle();
  return (data?.artist_slug as string | undefined) ?? null;
}

/**
 * Create a new artist. Returns { success, slug } on success or { error } on
 * validation/DB failure. The client form (CreateArtistForm) handles the
 * post-success navigation via router.push so retry-on-503 + visible status
 * can work without the redirect throwing NEXT_REDIRECT mid-retry.
 */
export async function createArtistAction(formData: FormData) {
  // Creating a new artist is super-admin only.
  const guard = await authorizeAdmin({ superAdminOnly: true });
  if (!guard.ok) return { error: "Only super-admins can create artists." };
  const slug = String(formData.get("slug") ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-");
  const name = String(formData.get("name") ?? "").trim();
  if (!slug || !name) {
    return { error: "Slug and display name are required." };
  }
  const supa = createAdminClient();
  const { error } = await supa
    .from("artists")
    .insert({ slug, name, sort_order: 99 });
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/admin/artists");
  return { success: true as const, slug };
}

export async function updateArtistAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  await assertAdmin({ communityId: slug, minRole: EDIT_ROLE });
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const heroImage = String(formData.get("hero_image") ?? "").trim();
  const heroFocalX = parseInt(String(formData.get("hero_focal_x") ?? "50"), 10);
  const heroFocalY = parseInt(String(formData.get("hero_focal_y") ?? "50"), 10);
  const clampFocal = (n: number) =>
    Math.max(0, Math.min(100, Number.isFinite(n) ? n : 50));
  const accentFrom = String(formData.get("accent_from") ?? "#7c3aed").trim();
  const accentTo = String(formData.get("accent_to") ?? "#f97316").trim();
  const genresRaw = String(formData.get("genres") ?? "").trim();
  const socialRaw = String(formData.get("social") ?? "").trim();
  const active = String(formData.get("active") ?? "true") === "true";
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "99"), 10);
  const genres = genresRaw
    ? genresRaw
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];
  // Social is one entry per textarea line. parseSocialLines accepts both
  // "Label | URL" (legacy explicit) and bare URLs (auto-detects label from
  // domain). See lib/socials/parse.ts for the full format spec.
  const social = parseSocialLines(socialRaw);
  const supa = createAdminClient();
  await supa
    .from("artists")
    .update({
      name,
      tagline: tagline || null,
      bio: bio || null,
      hero_image: heroImage || null,
      hero_focal_x: clampFocal(heroFocalX),
      hero_focal_y: clampFocal(heroFocalY),
      accent_from: accentFrom,
      accent_to: accentTo,
      genres,
      social,
      active,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 99,
    })
    .eq("slug", slug);
  revalidatePath("/admin/artists");
  revalidatePath(`/admin/artists/${slug}`);
  revalidatePath(`/artists/${slug}`);
  revalidatePath(`/artists`);
}

/**
 * Create a new event for an artist. Returns { success } on success or
 * { error } on validation/DB failure. The client form (CreateEventForm)
 * uses useFormSave for retry-on-503 + visible status feedback.
 */
/**
 * 0090 venue location from the admin event forms — see resolveEventGeo in
 * lib/events/build-event-row.ts (shared with the portal bulk importer).
 */
function eventGeoFromForm(formData: FormData) {
  return resolveEventGeo({
    city: String(formData.get("city") ?? ""),
    region: String(formData.get("region") ?? ""),
    lat: String(formData.get("lat") ?? ""),
    lng: String(formData.get("lng") ?? ""),
  });
}

export async function createEventAction(formData: FormData) {
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!artistSlug || !title) {
    return { error: "Title is required." };
  }
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: EDIT_ROLE });
  if (!guard.ok) return { error: "You do not manage this artist." };
  const detail = String(formData.get("detail") ?? "").trim();
  const eventDate = String(formData.get("event_date") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;
  const opensAt = rsvpOpensAtFromForm(formData);
  if (!opensAt.ok) return { error: opensAt.error };

  const supa = createAdminClient();
  const row = {
    artist_slug: artistSlug,
    ...buildEventRow({ title, detail, eventDate, startsAt, location, url, capacity, sortOrder }),
  };
  const geo = eventGeoFromForm(formData);
  let { error } = await supa.from("artist_events").insert({
    ...row,
    ...geo,
    rsvp_opens_at: opensAt.value,
  });
  if (error && isMissingEventGeoColumn(error)) {
    // Migration 0090 not applied yet: save without the venue location.
    ({ error } = await supa.from("artist_events").insert({
      ...row,
      rsvp_opens_at: opensAt.value,
    }));
  }
  if (error && isMissingRsvpOpensColumn(error)) {
    if (opensAt.value) return { error: RSVP_OPENS_MIGRATION_ERROR };
    ({ error } = await supa.from("artist_events").insert(row));
  }
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/admin/artists/${artistSlug}`);
  revalidatePath(`/artists/${artistSlug}`);
  return { success: true as const };
}

/**
 * Update an existing event. Mirrors createEventAction's field shape so the
 * EditEventForm can reuse the same form layout. Includes the `active` flag
 * (so admins can hide an event without deleting) and `sort_order` (so the
 * row order on the public artist page can be tuned). Returns { success } or
 * { error } so the client EditEventForm can use useFormSave for
 * retry-on-503 + visible status feedback.
 *
 * Notes
 *  • `active` arrives as the literal string "true" when the checkbox is
 *    checked, or is absent from the FormData when unchecked. We treat
 *    "true" as true and everything else (including missing) as false.
 *  • `tier` is intentionally NOT exposed in the form — events still
 *    default to 'public' on insert, and the existing seeded data is all
 *    public-tier. Add tier control here if/when the admin UI grows a
 *    "premium" toggle.
 */
export async function updateEventAction(formData: FormData) {
  const eventId = String(formData.get("event_id") ?? "").trim();
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  if (!eventId || !artistSlug) {
    return { error: "Missing event_id or artist_slug." };
  }
  // The update below also filters on artist_slug, so the event must belong
  // to the artist the caller is authorized for.
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: EDIT_ROLE });
  if (!guard.ok) return { error: "You do not manage this artist." };
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "Title is required." };
  }
  const detail = String(formData.get("detail") ?? "").trim();
  const eventDate = String(formData.get("event_date") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;
  // Checkbox: present + "true" means active. Missing means unchecked.
  const active = String(formData.get("active") ?? "") === "true";
  const opensAt = rsvpOpensAtFromForm(formData);
  if (!opensAt.ok) return { error: opensAt.error };

  const supa = createAdminClient();
  const row = {
    ...buildEventRow({ title, detail, eventDate, startsAt, location, url, capacity, sortOrder }),
    active,
  };
  const geo = eventGeoFromForm(formData);
  let { error } = await supa
    .from("artist_events")
    .update({ ...row, ...geo, rsvp_opens_at: opensAt.value })
    .eq("id", eventId)
    .eq("artist_slug", artistSlug);
  if (error && isMissingEventGeoColumn(error)) {
    // Migration 0090 not applied yet: save without the venue location.
    ({ error } = await supa
      .from("artist_events")
      .update({ ...row, rsvp_opens_at: opensAt.value })
      .eq("id", eventId)
      .eq("artist_slug", artistSlug));
  }
  if (error && isMissingRsvpOpensColumn(error)) {
    if (opensAt.value) return { error: RSVP_OPENS_MIGRATION_ERROR };
    ({ error } = await supa
      .from("artist_events")
      .update(row)
      .eq("id", eventId)
      .eq("artist_slug", artistSlug));
  }

  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/admin/artists/${artistSlug}`);
  revalidatePath(`/artists/${artistSlug}`);
  return { success: true as const };
}

export async function sendReminderNowAction(formData: FormData) {
  const eventId = String(formData.get("event_id") ?? "").trim();
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  if (!eventId || !artistSlug) return;
  const supa = createAdminClient();
  const [{ data: event }, { data: artist }] = await Promise.all([
    supa
      .from("artist_events")
      .select("id, artist_slug, title, detail, starts_at, location, url, reminder_sms_template")
      .eq("id", eventId)
      .maybeSingle(),
    supa.from("artists").select("name").eq("slug", artistSlug).maybeSingle(),
  ]);
  if (!event) return;
  await assertAdmin({ communityId: event.artist_slug as string, minRole: EDIT_ROLE });
  const reminderEvent: ReminderWindowEvent = {
    id: event.id as string,
    artist_slug: event.artist_slug as string,
    title: event.title as string,
    detail: (event.detail as string | null) ?? null,
    starts_at: (event.starts_at as string) ?? new Date().toISOString(),
    location: (event.location as string | null) ?? null,
    url: (event.url as string | null) ?? null,
    reminder_sms_template: (event.reminder_sms_template as string | null) ?? null,
    artist_name: (artist?.name as string | null) ?? null,
  };
  await sendEventReminder(reminderEvent, "manual");
  revalidatePath(`/admin/artists/${artistSlug}`);
}

export async function deleteEventAction(formData: FormData) {
  const id = String(formData.get("event_id") ?? "");
  if (!id) return;
  const artistSlug = await loadEventArtist(id);
  if (!artistSlug) return;
  await assertAdmin({ communityId: artistSlug, minRole: EDIT_ROLE });
  const supa = createAdminClient();
  await supa.from("artist_events").delete().eq("id", id).eq("artist_slug", artistSlug);
  revalidatePath(`/admin/artists/${artistSlug}`);
  revalidatePath(`/artists/${artistSlug}`);
}
