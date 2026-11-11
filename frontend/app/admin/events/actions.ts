"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminCommunityId } from "@/lib/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import { buildEventRow, eventOwnerColumns } from "@/lib/events/build-event-row";
import { duplicateEventWindowStart, parseCapacity } from "@/lib/events/duplicate-guard";

/** Same role the artist editor needs to create events. */
const EDIT_ROLE = "admin" as const;

/** The artist this admin is working on, after checking they may edit it. */
async function writableArtistSlug(): Promise<string> {
  const artistSlug = await getAdminCommunityId();
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: EDIT_ROLE });
  if (!guard.ok) {
    redirect(guard.reason === "signed_out" ? "/login?next=/admin/events" : "/admin");
  }
  return artistSlug;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function refresh(artistSlug: string): void {
  revalidatePath("/admin/events");
  revalidatePath(`/admin/artists/${artistSlug}`);
  revalidatePath(`/artists/${artistSlug}`);
}

export async function addEventAction(formData: FormData) {
  const artistSlug = await writableArtistSlug();
  const title = field(formData, "title");
  if (!title) {
    console.warn("action error:", "Title is required.");
    return;
  }

  const supa = createAdminClient();

  // Backstop for double clicks/taps: the same title for this artist in the
  // last minute is the same submission arriving twice, so don't save it again.
  const { data: recent, error: lookupError } = await supa
    .from("artist_events")
    .select("id")
    .eq("artist_slug", artistSlug)
    .eq("title", title)
    .gte("created_at", duplicateEventWindowStart(new Date()))
    .limit(1);
  if (lookupError) {
    console.warn("action error:", lookupError.message);
    return;
  }
  if (recent && recent.length > 0) {
    refresh(artistSlug);
    return;
  }

  const row = {
    ...eventOwnerColumns(artistSlug),
    ...buildEventRow({
      title,
      detail: field(formData, "detail"),
      eventDate: field(formData, "event_date"),
      startsAt: field(formData, "starts_at"),
      location: field(formData, "location"),
      url: field(formData, "url"),
      capacity: parseCapacity(field(formData, "capacity")),
      sortOrder: 0,
    }),
  };
  const { error } = await supa.from("artist_events").insert(row);
  if (error) {
    console.warn("action error:", error.message);
    return;
  }
  refresh(artistSlug);
}

export async function removeEventAction(formData: FormData) {
  const artistSlug = await writableArtistSlug();
  const id = field(formData, "event_id");
  if (!id) {
    console.warn("action error:", "Missing event.");
    return;
  }

  // Filtering on artist_slug keeps an admin from removing another artist's event.
  const { error } = await createAdminClient()
    .from("artist_events")
    .delete()
    .eq("id", id)
    .eq("artist_slug", artistSlug);
  if (error) {
    console.warn("action error:", error.message);
    return;
  }
  refresh(artistSlug);
}
