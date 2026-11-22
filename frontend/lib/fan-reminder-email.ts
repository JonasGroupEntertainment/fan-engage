/**
 * Rules and copy for the two reminder emails: "your streak ends tonight"
 * and "someone passed you on the leaderboard".
 *
 * Both are one message to one fan through the transactional (Mandrill)
 * path, never a Mailchimp campaign. The gates match the event reminder
 * and the day-3 / day-7 email (lib/event-reminder-email.ts,
 * lib/reengagement-email.ts): opted in to email, not suspended, not an
 * internal or test fan, has an address, and has an unsubscribe token so
 * every email carries the fan's own unsubscribe link. Like those emails
 * there is no separate age rule: a fan of 13 to 17 who opted in to email
 * is treated the same as an adult. Only texts and paid tiers are 18+.
 *
 * On top of those gates:
 *   - off unless FAN_REMINDER_EMAIL_ENABLED is exactly "1"
 *   - the fan has not switched that kind of reminder off
 *   - at most one reminder email of any kind per fan in a rolling
 *     REMINDER_EMAIL_CAP_DAYS days, recorded in notification_log. Two
 *     crons can reach the same fan in the same minute, so after a send is
 *     claimed the claims are read back and only the earliest one sends
 *   - a streak email is not sent inside the fan's quiet hours, and it
 *     gives the end of the streak on the fan's own clock, as the push does
 *
 * Pure: no env reads beyond the injected flag, no Supabase, no imports.
 */

export type FanReminderEmailEnv = { FAN_REMINDER_EMAIL_ENABLED?: string };

/** At most one reminder email per fan in this many days. */
export const REMINDER_EMAIL_CAP_DAYS = 7;
/** A streak shorter than this is not worth an email. Matches the push. */
export const REMINDER_EMAIL_MIN_STREAK = 3;
/** notification_log.notification_type for every reminder email. */
export const REMINDER_EMAIL_LOG_TYPE = "fan_reminder_email";
export const FAN_REMINDER_EMAIL_TAGS = ["fan-reminder"] as const;

const ENABLED_VALUE = "1";
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_NAME_MAX = 40;
const SCORE_SOURCES = "Check-ins, RSVPs, shares, posts, comments and reactions all add to your score.";

export type ReminderEmailKind = "streak_at_risk" | "leaderboard_overtaken";

export type ReminderEmailFan = {
  id: string;
  email: string | null;
  first_name: string | null;
  email_opted_in: boolean | null;
  suspended: boolean | null;
  is_internal: boolean | null;
  unsubscribe_token: string | null;
};

export type ReminderEmailArtist = { slug: string; name: string };

export type ReminderEmailBlockReason =
  | "fan_not_found"
  | "not_opted_in"
  | "suspended"
  | "internal"
  | "no_address"
  | "no_unsubscribe_link";

export type ReminderEmailMessage = { subject: string; text: string; html: string; url: string };

export function isFanReminderEmailEnabled(
  env: FanReminderEmailEnv = {
    FAN_REMINDER_EMAIL_ENABLED: process.env.FAN_REMINDER_EMAIL_ENABLED,
  },
): boolean {
  return env.FAN_REMINDER_EMAIL_ENABLED?.trim() === ENABLED_VALUE;
}

/** Why this fan may not be emailed, or null when they may. */
export function reminderEmailBlockReason(
  fan: ReminderEmailFan | null,
): ReminderEmailBlockReason | null {
  if (!fan) return "fan_not_found";
  if (fan.email_opted_in !== true) return "not_opted_in";
  if (fan.suspended !== false) return "suspended";
  if (fan.is_internal !== false) return "internal";
  if (!fan.email?.trim()) return "no_address";
  if (!fan.unsubscribe_token?.trim()) return "no_unsubscribe_link";
  return null;
}

/** Reminder emails recorded at or after this instant count against the cap. */
export function reminderEmailCapCutoffIso(now: Date): string {
  return new Date(now.getTime() - REMINDER_EMAIL_CAP_DAYS * DAY_MS).toISOString();
}

/** A queued or sent reminder email row in notification_log. */
export type ReminderEmailClaim = { id: string; sent_at: string | null };

/** Shown on a claim that lost to an earlier one. */
export const REMINDER_EMAIL_CLAIM_LOST = "another reminder email was already claimed";

function claimTime(claim: ReminderEmailClaim): number {
  const ms = Date.parse(claim.sent_at ?? "");
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function claimOrder(a: ReminderEmailClaim, b: ReminderEmailClaim): number {
  const byTime = claimTime(a) - claimTime(b);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The one claim in the window that may send: the earliest by time, and by
 * id when two share a time. Both racers read the same rows and reach the
 * same answer, so exactly one of them sends. Null when there are none.
 */
export function winningReminderEmailClaim(
  claims: readonly ReminderEmailClaim[],
): ReminderEmailClaim | null {
  return [...claims].sort(claimOrder)[0] ?? null;
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

type Layout = {
  subject: string;
  firstName: string | null;
  paragraphs: readonly string[];
  buttonLabel: string;
  buttonUrl: string;
  /** What to switch off in settings to stop only this kind of email. */
  settingName: string;
  appUrl: string;
  unsubscribeToken: string;
};

function homeOf(appUrl: string): string {
  return appUrl.replace(/\/+$/, "");
}

/** Greeting, the paragraphs, one button, then settings and unsubscribe. */
function layout(input: Layout): ReminderEmailMessage {
  const name = safeFirstName(input.firstName);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const home = homeOf(input.appUrl);
  const settings = `${home}/me/notifications`;
  const unsubscribe = `${home}/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const why = `You are getting this because email is on for your Fan Engage account. To stop only ${input.settingName}, change your notification settings: ${settings}`;

  const text = [
    greeting,
    ...input.paragraphs,
    `${input.buttonLabel}: ${input.buttonUrl}`,
    why,
    `To stop all Fan Engage emails, unsubscribe: ${unsubscribe}`,
    "Fan Engage",
  ].join("\n\n");

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.55;color:#0f172a">
<p>${escapeHtml(greeting)}</p>
${input.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${escapeHtml(input.buttonUrl)}" style="background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(input.buttonLabel)}</a></p>
<p style="margin-top:32px;font-size:12px;color:#64748b">You are getting this because email is on for your Fan Engage account. To stop only ${escapeHtml(input.settingName)}, <a href="${escapeHtml(settings)}" style="color:#64748b">change your notification settings</a>. To stop all Fan Engage emails, <a href="${escapeHtml(unsubscribe)}" style="color:#64748b">unsubscribe</a>.</p>
</body></html>`;

  return { subject: input.subject, text, html, url: input.buttonUrl };
}

/**
 * "Your 7-day streak ends tonight at 6 PM." `endsAtLocal` is the end of
 * the streak on the fan's own clock, from lib/streaks/at-risk.ts. Only a
 * signed-in visit to Fan Home or an artist page keeps a streak
 * (lib/streaks/touch.ts), so that is all the email asks for.
 */
export function buildStreakReminderEmail(input: {
  firstName: string | null;
  streakDays: number;
  endsAtLocal: string;
  artist: ReminderEmailArtist | null;
  appUrl: string;
  unsubscribeToken: string;
}): ReminderEmailMessage {
  const days = Math.max(0, Math.floor(input.streakDays));
  const home = homeOf(input.appUrl);
  const place = input.artist ? `${input.artist.name}'s page` : "your Fan Home";
  const headline = `Your ${days}-day streak ends ${input.endsAtLocal}`;
  return layout({
    subject: headline,
    firstName: input.firstName,
    paragraphs: [
      `${headline}.`,
      `One visit keeps it going. Open ${place} before then, signed in, and today counts. You do not need to post or react.`,
    ],
    buttonLabel: "Keep my streak",
    buttonUrl: input.artist ? `${home}/artists/${input.artist.slug}` : `${home}/`,
    settingName: "streak reminders",
    appUrl: input.appUrl,
    unsubscribeToken: input.unsubscribeToken,
  });
}

/** "You dropped to #4 on RaeLynn's leaderboard." */
export function buildOvertakenEmail(input: {
  firstName: string | null;
  artist: ReminderEmailArtist;
  newRank: number;
  previousRank: number;
  appUrl: string;
  unsubscribeToken: string;
}): ReminderEmailMessage {
  const { artist } = input;
  return layout({
    subject: `You dropped to #${input.newRank} on ${artist.name}'s leaderboard`,
    firstName: input.firstName,
    paragraphs: [
      `Someone passed you on ${artist.name}'s leaderboard. You were #${input.previousRank} yesterday and you are #${input.newRank} today.`,
      `The board runs to the end of the month. ${SCORE_SOURCES}`,
    ],
    buttonLabel: "See the leaderboard",
    buttonUrl: `${homeOf(input.appUrl)}/artists/${artist.slug}/leaderboard`,
    settingName: "leaderboard movement",
    appUrl: input.appUrl,
    unsubscribeToken: input.unsubscribeToken,
  });
}
