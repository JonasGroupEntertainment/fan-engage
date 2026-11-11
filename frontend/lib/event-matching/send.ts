/**
 * Send event-match notifications to the candidate set for an event.
 *
 * For every event_match_log row where is_candidate = true and sent_at
 * is still null:
 *
 *   1. Write a row to public.notifications (in-app inbox) with a
 *      stable dedup_key so re-running can't double-fire.
 *   2. If the fan has sms_opted_in = true and a phone number, send
 *      one SMS via Twilio.
 *   3. Stamp event_match_log with sent_at + channels_sent.
 *
 * Idempotent: skipping rows that already have sent_at means re-clicks
 * don't re-notify. Step 3 is the last write, so a partial failure
 * leaves the row in a "ready" state and the next click retries.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface SendEventMatchResult {
  event_id: string;
  attempted: number;
  in_app_sent: number;
  sms_attempted: number;
  sms_sent: number;
  sms_failed: number;
  errors: Array<{ fan_id: string; error: string }>;
}

export async function sendEventMatchNotifications(
  eventId: string,
): Promise<SendEventMatchResult> {
  const admin = createAdminClient();
  const result: SendEventMatchResult = {
    event_id: eventId,
    attempted: 0,
    in_app_sent: 0,
    sms_attempted: 0,
    sms_sent: 0,
    sms_failed: 0,
    errors: [],
  };

  // Load event metadata for the SMS / notification body.
  const { data: event, error: eventErr } = await admin
    .from("artist_events")
    .select("id, artist_slug, community_id, title, location, starts_at, url")
    .eq("id", eventId)
    .maybeSingle();
  if (eventErr || !event) {
    throw new Error(
      `event ${eventId} not found: ${eventErr?.message ?? "no row"}`,
    );
  }
  // The notification is filed under the event's own community. Without this
  // the row used to fall back to a database default of 'raelynn'.
  const eventCommunityId =
    (event.community_id as string | null) ?? (event.artist_slug as string);

  const { data: artist } = await admin
    .from("artists")
    .select("display_name, slug")
    .eq("slug", event.artist_slug)
    .maybeSingle();
  const artistName =
    (artist?.display_name as string) ?? (event.artist_slug as string);

  // Load unsent candidates with the fan fields we need.
  const { data: rows, error: listErr } = await admin
    .from("event_match_log")
    .select(
      "fan_id, channels_sent, fans!inner(first_name, phone, sms_opted_in)",
    )
    .eq("event_id", eventId)
    .eq("is_candidate", true)
    .is("sent_at", null);
  if (listErr) {
    throw new Error(`event_match_log read failed: ${listErr.message}`);
  }

  const candidates = ((rows ?? []) as unknown as Array<{
    fan_id: string;
    channels_sent: string[];
    fans: {
      first_name: string | null;
      phone: string | null;
      sms_opted_in: boolean;
    };
  }>);

  if (candidates.length === 0) return result;

  // Compose notification copy.
  const eventUrl = `/artists/${event.artist_slug}#event-${event.id}`;
  const inAppTitle = `${artistName} just announced an event you'd love`;
  const inAppBody = formatBody(
    event.title as string,
    event.location as string | null,
    event.starts_at as string | null,
  );

  // Twilio config (only required if any candidate is sms_opted_in).
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const defaultFrom = process.env.TWILIO_DEFAULT_FROM;
  const twilioReady =
    !!accountSid && !!authToken && (!!messagingServiceSid || !!defaultFrom);

  let twilioClient: import("twilio").Twilio | null = null;
  if (twilioReady) {
    const { default: twilio } = await import("twilio");
    twilioClient = twilio(accountSid as string, authToken as string);
  }

  for (const c of candidates) {
    result.attempted += 1;
    const channels: string[] = [];

    // 1) In-app notification (always — it's the durable record).
    const dedupKey = `event-match:${eventId}:${c.fan_id}`;
    const { error: notifErr } = await admin.from("notifications").insert({
      fan_id: c.fan_id,
      community_id: eventCommunityId,
      kind: "event_match",
      title: inAppTitle,
      body: inAppBody,
      url: eventUrl,
      icon: "🎟️",
      dedup_key: dedupKey,
    });
    // Unique-violation on dedup_key is fine — means we already sent this
    // fan and a prior pass didn't get to update event_match_log. Don't
    // count it as a failure.
    if (notifErr && !`${notifErr.message}`.toLowerCase().includes("duplicate")) {
      result.errors.push({ fan_id: c.fan_id, error: notifErr.message });
      continue;
    }
    if (!notifErr) {
      result.in_app_sent += 1;
      channels.push("in_app");
    } else {
      // Already had a row from a prior partial run.
      channels.push("in_app");
    }

    // 2) SMS — only if Twilio is configured + fan opted in + has phone.
    if (
      twilioClient &&
      c.fans.sms_opted_in === true &&
      c.fans.phone &&
      c.fans.phone.trim().length > 0
    ) {
      const smsBody = formatSms({
        firstName: c.fans.first_name,
        artistName,
        title: event.title as string,
        location: event.location as string | null,
        startsAt: event.starts_at as string | null,
      });
      result.sms_attempted += 1;
      try {
        await twilioClient.messages.create({
          to: c.fans.phone,
          body: smsBody,
          ...(messagingServiceSid
            ? { messagingServiceSid }
            : { from: defaultFrom as string }),
        });
        result.sms_sent += 1;
        channels.push("sms");
      } catch (err) {
        result.sms_failed += 1;
        result.errors.push({
          fan_id: c.fan_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // Twilio rate-limit politeness — same throttle broadcast.ts uses.
      await new Promise((r) => setTimeout(r, 250));
    }

    // 3) Stamp the audit row last, so a partial failure leaves it in
    //    "ready" state for retry.
    await admin
      .from("event_match_log")
      .update({
        sent_at: new Date().toISOString(),
        channels_sent: channels,
      })
      .eq("event_id", eventId)
      .eq("fan_id", c.fan_id);
  }

  return result;
}

function formatBody(
  title: string,
  location: string | null,
  startsAt: string | null,
): string {
  const when = startsAt
    ? new Date(startsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const parts = [title];
  if (location) parts.push(location);
  if (when) parts.push(when);
  return parts.join(" · ");
}

function formatSms(opts: {
  firstName: string | null;
  artistName: string;
  title: string;
  location: string | null;
  startsAt: string | null;
}): string {
  const greet = opts.firstName ? `Hey ${opts.firstName}, ` : "";
  const when = opts.startsAt
    ? new Date(opts.startsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "soon";
  const loc = opts.location ? ` in ${opts.location}` : "";
  const base =
    `${greet}${opts.artistName} just announced ${opts.title}${loc} on ${when}. ` +
    `Open Fan Engage to RSVP.`;
  // STOP footer (10DLC compliance).
  return base.toUpperCase().includes("STOP")
    ? base
    : `${base} Reply STOP to opt out.`;
}
