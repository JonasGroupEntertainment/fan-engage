/**
 * Rules and copy for the event reminder (24 hours and 1 hour before an
 * event, plus the admin "Send reminder now" button).
 *
 * A reminder goes only to fans who RSVPed to that event. The email is one
 * message per fan through the transactional path, never a Mailchimp
 * campaign to the whole audience. The gates match the day-3 / day-7 email
 * (lib/reengagement-email.ts): opted in to email, not suspended, not an
 * internal or test fan, has an address, and has an unsubscribe token so
 * every email carries the fan's own unsubscribe link.
 *
 * Pure: no env, no Supabase, no imports.
 */

export type ReminderKind = "reminder_24h" | "reminder_1h" | "manual";

export type ReminderEvent = {
  id: string;
  title: string;
  detail: string | null;
  location: string | null;
  url: string | null;
  artist_name: string | null;
};

export type ReminderFanRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  email_opted_in: boolean;
  suspended: boolean;
  is_internal: boolean;
  unsubscribe_token: string | null;
};

const ARTIST_NAME_FALLBACK = "Your artist";
const FIRST_NAME_MAX = 40;
const UNIQUE_VIOLATION = "23505";
const WEB_URL = /^https?:\/\//i;

const REMINDER_WHEN: Record<ReminderKind, string> = {
  reminder_24h: "tomorrow",
  reminder_1h: "in 1 hour",
  manual: "soon",
};

function mayBeEmailed(fan: ReminderFanRow): boolean {
  if (fan.email_opted_in !== true) return false;
  if (fan.suspended !== false || fan.is_internal !== false) return false;
  return Boolean(fan.email?.trim()) && Boolean(fan.unsubscribe_token?.trim());
}

/**
 * The fans who get the reminder email: they RSVPed to the event and may be
 * emailed. One entry per fan. A fan who did not RSVP is never returned,
 * whatever else is true of them.
 */
export function selectReminderEmailRecipients(
  rsvpFanIds: readonly string[],
  fans: readonly ReminderFanRow[],
): ReminderFanRow[] {
  const rsvped = new Set(rsvpFanIds);
  const byId = new Map<string, ReminderFanRow>();
  for (const fan of fans) {
    if (!rsvped.has(fan.id) || byId.has(fan.id) || !mayBeEmailed(fan)) continue;
    byId.set(fan.id, fan);
  }
  return [...byId.values()];
}

/**
 * What a claim insert into event_reminders means. The unique index on
 * (event_id, kind) makes a second scheduled claim fail, which is how one
 * reminder per event per window is kept even if a run is cut short.
 * Any other error fails closed: nothing is sent.
 */
export function reminderClaimOutcome(
  error: { code?: string | null } | null,
): "claimed" | "already" | "failed" {
  if (!error) return "claimed";
  return error.code === UNIQUE_VIOLATION ? "already" : "failed";
}

function headline(event: ReminderEvent, kind: ReminderKind): string {
  const artistName = event.artist_name ?? ARTIST_NAME_FALLBACK;
  const where = event.location ? ` at ${event.location}` : "";
  return `${artistName}'s ${event.title} starts ${REMINDER_WHEN[kind]}${where}.`;
}

function webUrl(url: string | null): string | null {
  const trimmed = url?.trim() ?? "";
  return WEB_URL.test(trimmed) ? trimmed : null;
}

/** Default text message. A per-event template still overrides it. */
export function eventReminderSms(event: ReminderEvent, kind: ReminderKind): string {
  const link = event.url ? ` Link: ${event.url}` : "";
  return `${headline(event, kind)}${link} See you there!`;
}

export function eventReminderSubject(event: ReminderEvent, kind: ReminderKind): string {
  return `Reminder: ${event.title} starts ${REMINDER_WHEN[kind]}`;
}

function safeFirstName(firstName: string | null): string | null {
  if (!firstName) return null;
  const cleaned = firstName.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, FIRST_NAME_MAX);
  return cleaned || null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** One fan's reminder email, with that fan's own unsubscribe link. */
export function buildEventReminderEmail(input: {
  event: ReminderEvent;
  kind: ReminderKind;
  firstName: string | null;
  appUrl: string;
  unsubscribeToken: string;
}): { subject: string; text: string; html: string } {
  const { event, kind } = input;
  const name = safeFirstName(input.firstName);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const lead = `Quick heads up: ${headline(event, kind)}`;
  const reason = "You are getting this because you RSVPed. See you there!";
  const home = input.appUrl.replace(/\/+$/, "");
  const unsubscribe = `${home}/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const details = webUrl(event.url);
  const subject = eventReminderSubject(event, kind);

  const text = [
    greeting,
    lead,
    ...(event.detail ? [event.detail] : []),
    ...(details ? [`Details: ${details}`] : []),
    reason,
    `If you would rather not get Fan Engage emails, unsubscribe: ${unsubscribe}`,
    "Fan Engage",
  ].join("\n\n");

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.55;color:#0f172a">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(lead)}</p>
${event.detail ? `<p style="white-space:pre-wrap">${escapeHtml(event.detail)}</p>\n` : ""}${details ? `<p><a href="${escapeHtml(details)}" style="color:#0f172a;font-weight:600">Event details</a></p>\n` : ""}<p>${escapeHtml(reason)}</p>
<p style="margin-top:32px;font-size:12px;color:#64748b"><a href="${escapeHtml(unsubscribe)}" style="color:#64748b">Unsubscribe from Fan Engage emails</a></p>
</body></html>`;

  return { subject, text, html };
}
