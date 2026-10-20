"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyRsvpConfirmation } from "@/lib/notifications/triggers/rsvp-confirmation";
import {
  loadEventRsvpSchedule,
  viewerFoundingFanNumber,
  viewerManagesEventRsvps,
} from "@/lib/rsvp-access";
import { evaluateRsvpWindow, rsvpClosedMessage } from "@/lib/rsvp-window";

export async function toggleRsvpAction(formData: FormData) {
  const eventId = String(formData.get("event_id") ?? "").trim();
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const wantRsvp = String(formData.get("rsvp") ?? "true") === "true";
  if (!eventId || !artistSlug) return { ok: false as const, error: "Missing event" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  // Cancelling is always allowed, including after the window closes.
  if (!wantRsvp) {
    await supabase
      .from("event_rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("fan_id", user.id);
    revalidatePath(`/artists/${artistSlug}`);
    revalidatePath("/");
    return { ok: true as const };
  }

  const loaded = await loadEventRsvpSchedule(eventId);
  if (!loaded.ok) return { ok: false as const, error: loaded.error };
  if (loaded.schedule.artistSlug !== artistSlug) {
    return { ok: false as const, error: "Missing event" };
  }

  const [foundingFanNumber, isAdmin] = await Promise.all([
    viewerFoundingFanNumber(artistSlug),
    viewerManagesEventRsvps(artistSlug),
  ]);
  const decision = evaluateRsvpWindow({
    now: new Date(),
    rsvpOpensAt: loaded.schedule.rsvpOpensAt,
    foundingFanNumber,
    isAdmin,
  });
  if (!decision.allowed) {
    return {
      ok: false as const,
      error: decision.state === "closed" ? rsvpClosedMessage(decision) : "RSVP isn't open yet",
    };
  }

  // Admin bypass uses the service role so the window trigger allows it
  // for ADMIN_EMAILS operators who are not in admin_users. Capacity and
  // points triggers still run. Everyone else inserts as themselves, and
  // the trigger enforces the same window.
  const writer =
    decision.state === "open" && decision.reason === "admin" ? createAdminClient() : supabase;
  const { error } = await writer
    .from("event_rsvps")
    .insert({ event_id: eventId, fan_id: user.id });
  if (error) {
    revalidatePath(`/artists/${artistSlug}`);
    return {
      ok: false as const,
      error: error.message.includes("capacity")
        ? "Event is at capacity"
        : error.message.includes("not open")
          ? "RSVP isn't open yet"
          : "Couldn't RSVP (try again in a moment)",
    };
  }

  notifyRsvpConfirmation({ fanId: user.id, eventId, artistSlug }).catch(() => {});
  revalidatePath(`/artists/${artistSlug}`);
  revalidatePath("/");
  return { ok: true as const };
}
