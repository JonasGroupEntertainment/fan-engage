"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPortalRole } from "@/lib/artist-portal/access";

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
