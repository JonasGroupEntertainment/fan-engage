"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  matchEvent,
  sendEventMatchNotifications,
} from "@/lib/event-matching";

/**
 * Checks the caller administers the artist that owns this event, using
 * the event row in the database rather than the slug from the page.
 */
async function requireEventAdmin(eventId: string): Promise<void> {
  const { data } = await createAdminClient()
    .from("artist_events")
    .select("artist_slug")
    .eq("id", eventId)
    .maybeSingle();
  const artistSlug = (data?.artist_slug as string | undefined) ?? "";
  if (!artistSlug) throw new Error("Event not found");
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: "admin" });
  if (!guard.ok && guard.reason === "signed_out") redirect("/login?next=/admin");
  if (!guard.ok) throw new Error("Forbidden");
}

/**
 * Re-run the scoring for an event. Used after follower changes or
 * scoring-weight tweaks. Idempotent — overwrites prior rows.
 */
export async function rescoreEventAction(eventId: string, slug: string) {
  await requireEventAdmin(eventId);

  await matchEvent(eventId);
  revalidatePath(`/admin/artists/${slug}/events/${eventId}/match`);
}

/**
 * Send in-app + SMS notifications to all unsent candidates.
 * Idempotent: skipping already-sent rows means re-clicks don't
 * re-notify.
 */
export async function sendEventMatchAction(eventId: string, slug: string) {
  await requireEventAdmin(eventId);

  await sendEventMatchNotifications(eventId);
  revalidatePath(`/admin/artists/${slug}/events/${eventId}/match`);
}
