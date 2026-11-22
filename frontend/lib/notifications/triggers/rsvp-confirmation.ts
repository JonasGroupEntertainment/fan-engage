import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";

/**
 * Send an immediate RSVP confirmation when a fan RSVPs to an event. Same-
 * day, instant feedback that their reservation went through.
 *
 * `bypassQuietHours` is intentionally true here — the fan literally just
 * tapped RSVP, they want the confirmation regardless of the hour.
 *
 * `bypassSmsTierGate` is also true — RSVP confirmations are valuable to
 * any tier, not just Gold+.
 *
 * No `inbox` here on purpose: the event_rsvps trigger in the database
 * (notify_rsvp_confirmed) already writes the "You're on the list" row.
 */
export async function notifyRsvpConfirmation(opts: {
  fanId: string;
  eventId: string;
  artistSlug: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: event } = await admin
      .from("artist_events")
      .select("title, starts_at, venue, city, state")
      .eq("id", opts.eventId)
      .maybeSingle();
    if (!event) return;

    const dateStr = event.starts_at
      ? new Date(event.starts_at as string).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : "Soon";
    const venueStr = [event.venue, event.city].filter(Boolean).join(", ");

    await sendNotification({
      fanId: opts.fanId,
      type: "rsvp_confirmation",
      payload: {
        title: `You're going to ${event.title as string}`,
        body: venueStr ? `${dateStr} · ${venueStr}` : dateStr,
        url: `/artists/${opts.artistSlug}#event-${opts.eventId}`,
        tag: `rsvp_confirmation:${opts.eventId}`,
      },
      bypassQuietHours: true,
      bypassSmsTierGate: true,
    });
  } catch (err) {
    console.warn("notifyRsvpConfirmation failed (non-blocking):", err);
  }
}
