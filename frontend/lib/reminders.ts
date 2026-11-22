import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastSms } from "@/lib/broadcast";
import { APP_URL } from "@/lib/app-url";
import { mandrillConfigured, sendMandrillBatch } from "@/lib/email/transactional";
import { pageAll, pageAllIn } from "@/lib/supabase/page-all";
import {
  eventReminderSms,
  reminderClaimOutcome,
  type ReminderFanRow,
  type ReminderKind,
} from "@/lib/event-reminder-email";
import {
  EVENT_REMINDER_EMAIL_TAGS,
  sendEventReminderEmails,
  type ReminderRsvpAudience,
} from "@/lib/event-reminder-email-send";

export type { ReminderKind };

export interface ReminderWindowEvent {
  id: string;
  artist_slug: string;
  title: string;
  detail: string | null;
  starts_at: string;
  location: string | null;
  url: string | null;
  reminder_sms_template: string | null;
  artist_name: string | null;
}

/**
 * Find events whose starts_at falls inside a reminder window and haven't
 * had this kind of reminder fired yet. The window is a bit wider than the
 * cron cadence (every 15 min) so we don't miss an event sitting right on
 * the boundary.
 */
export async function loadEventsInReminderWindow(kind: "reminder_24h" | "reminder_1h") {
  const admin = createAdminClient();
  const now = Date.now();

  // Center of the target window + 15 min half-width on each side.
  const offsetMinutes = kind === "reminder_24h" ? 24 * 60 : 60;
  const halfWidthMs = 15 * 60 * 1000;
  const center = now + offsetMinutes * 60 * 1000;
  const windowStart = new Date(center - halfWidthMs).toISOString();
  const windowEnd = new Date(center + halfWidthMs).toISOString();

  const { data: candidates } = await admin
    .from("artist_events")
    .select("id, artist_slug, title, detail, starts_at, location, url, reminder_sms_template")
    .eq("active", true)
    .not("starts_at", "is", null)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  if (!candidates || candidates.length === 0) return [];

  // Filter out events that already had this reminder fired.
  const ids = candidates.map((c) => c.id as string);
  const { data: already } = await admin
    .from("event_reminders")
    .select("event_id")
    .in("event_id", ids)
    .eq("kind", kind);
  const alreadySet = new Set((already ?? []).map((r) => r.event_id as string));

  const remaining = candidates.filter((c) => !alreadySet.has(c.id as string));
  if (remaining.length === 0) return [];

  // Attach artist name for nicer default template copy.
  const slugs = [...new Set(remaining.map((r) => r.artist_slug as string))];
  const { data: artists } = await admin
    .from("artists")
    .select("slug, name")
    .in("slug", slugs);
  const byName = new Map((artists ?? []).map((a) => [a.slug as string, a.name as string]));

  return remaining.map(
    (r) =>
      ({
        id: r.id as string,
        artist_slug: r.artist_slug as string,
        title: r.title as string,
        detail: (r.detail as string | null) ?? null,
        starts_at: r.starts_at as string,
        location: (r.location as string | null) ?? null,
        url: (r.url as string | null) ?? null,
        reminder_sms_template: (r.reminder_sms_template as string | null) ?? null,
        artist_name: byName.get(r.artist_slug as string) ?? null,
      }) as ReminderWindowEvent,
  );
}

const REMINDER_FAN_COLUMNS =
  "id, email, first_name, email_opted_in, suspended, is_internal, unsubscribe_token";

export type EventReminderResult = {
  smsRecipients: number;
  emailRecipients: number;
  error?: string;
};

type ChannelResult = { sent: number; error: string | null };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Everyone who RSVPed to the event, and their fans rows. Both reads are
 * paged so an event with more than 1,000 RSVPs is seen whole. The email
 * gates are applied here and again in selectReminderEmailRecipients.
 */
async function loadReminderAudience(eventId: string): Promise<ReminderRsvpAudience> {
  const admin = createAdminClient();
  const rsvps = await pageAll<{ fan_id: string }>(() =>
    admin
      .from("event_rsvps")
      .select("fan_id")
      .eq("event_id", eventId)
      .order("fan_id", { ascending: true }),
  );
  if (rsvps.error) throw new Error(`event_rsvps: ${rsvps.error.message}`);
  const rsvpFanIds = rsvps.data.map((r) => r.fan_id);

  const fans = await pageAllIn<ReminderFanRow, string>(rsvpFanIds, (part) =>
    admin
      .from("fans")
      .select(REMINDER_FAN_COLUMNS)
      .in("id", part)
      .eq("email_opted_in", true)
      .eq("suspended", false)
      .eq("is_internal", false)
      .order("id", { ascending: true }),
  );
  if (fans.error) throw new Error(`fans: ${fans.error.message}`);
  return { rsvpFanIds, fans: fans.data };
}

/** Text the fans who RSVPed. broadcastSms scopes by eventId. Never throws. */
async function sendReminderSms(event: ReminderWindowEvent, kind: ReminderKind): Promise<ChannelResult> {
  try {
    const result = await broadcastSms({
      body: event.reminder_sms_template || eventReminderSms(event, kind),
      messageType: "event_reminder",
      artistSlug: event.artist_slug,
      eventId: event.id,
    });
    return { sent: result.sent, error: result.error ?? null };
  } catch (err) {
    console.error("event reminder: SMS failed for event", event.id, err);
    return { sent: 0, error: errorText(err) };
  }
}

/**
 * Email the fans who RSVPed, one message each. This must not go through
 * broadcastEmail: that creates a Mailchimp campaign for the whole
 * audience, so a "you RSVPed" reminder would reach people who never did.
 */
async function sendReminderEmail(event: ReminderWindowEvent, kind: ReminderKind): Promise<ChannelResult> {
  const result = await sendEventReminderEmails({
    event,
    kind,
    appUrl: APP_URL,
    providerReady: mandrillConfigured(),
    loadAudience: loadReminderAudience,
    send: (recipients) => sendMandrillBatch(recipients, EVENT_REMINDER_EMAIL_TAGS),
  });
  if (result.error) console.warn("event reminder: email for event", event.id, result.error);
  return { sent: result.sent, error: result.error };
}

function joinChannelErrors(sms: ChannelResult, email: ChannelResult): string | null {
  const parts = [
    ...(sms.error ? [`sms: ${sms.error}`] : []),
    ...(email.error ? [`email: ${email.error}`] : []),
  ];
  return parts.length > 0 ? parts.join(" | ") : null;
}

/**
 * Send the SMS and email reminder for one event to the fans who RSVPed
 * and opted in to that channel.
 *
 * The event_reminders row is written first, as a claim. For the 24 hour
 * and 1 hour kinds the unique index on (event_id, kind) lets only one
 * claim through, so a run that is cut short or overlaps another can never
 * send the same reminder twice. If the claim cannot be written, nothing
 * is sent. The row is then updated with the delivery counts.
 *
 * Never throws for a failed channel; the error is returned and recorded.
 */
export async function sendEventReminder(
  event: ReminderWindowEvent,
  kind: ReminderKind,
): Promise<EventReminderResult> {
  const admin = createAdminClient();
  const claim = await admin
    .from("event_reminders")
    .insert({ event_id: event.id, kind })
    .select("id")
    .single();
  const outcome = reminderClaimOutcome(claim.error);
  if (outcome === "already") return { smsRecipients: 0, emailRecipients: 0 };
  if (outcome === "failed" || !claim.data) {
    const reason = claim.error?.message ?? "no row returned";
    return { smsRecipients: 0, emailRecipients: 0, error: `reminder not sent, could not record it: ${reason}` };
  }

  const [sms, email] = await Promise.all([
    sendReminderSms(event, kind),
    sendReminderEmail(event, kind),
  ]);
  const error = joinChannelErrors(sms, email);

  const { error: updateError } = await admin
    .from("event_reminders")
    .update({ recipients_sms: sms.sent, recipients_email: email.sent, error })
    .eq("id", claim.data.id as string);
  if (updateError) {
    console.error("event reminder: could not save counts for event", event.id, updateError.message);
  }

  return { smsRecipients: sms.sent, emailRecipients: email.sent, error: error ?? undefined };
}
