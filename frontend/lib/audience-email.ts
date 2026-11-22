/**
 * Rules and copy for an email an admin writes to one artist's fans, from
 * the Broadcast screen or the campaign builder.
 *
 * The email goes only to the fans the admin chose: the artist's fans,
 * narrowed by a tier or by an event's RSVPs when one is picked. It is one
 * message per fan through the transactional path, never a Mailchimp
 * campaign to the whole audience. Who may be emailed is decided by the
 * same gates as the event reminder (lib/event-reminder-email.ts).
 *
 * Pure: no env, no Supabase.
 */

export const TIER_FILTERS = ["all", "bronze", "silver", "gold", "platinum"] as const;
export type TierFilter = (typeof TIER_FILTERS)[number];

/** Lowest to highest. "Gold and up" is gold and everything after it. */
const TIERS_LOW_TO_HIGH = ["bronze", "silver", "gold", "platinum"] as const;

export type AudienceReason = "follower" | "rsvp";

export type AudienceMessage = {
  subject: string;
  /** Plain text, exactly as the admin typed it. Never HTML. */
  body: string;
  artistName: string;
  /** Why these fans were chosen, said to the fan in the footer. */
  reason: AudienceReason;
};

/** The tier the form sent, or null when it is not one the screen offers. */
export function parseTierFilter(raw: string): TierFilter | null {
  return (TIER_FILTERS as readonly string[]).includes(raw) ? (raw as TierFilter) : null;
}

/** The tiers a filter covers, or null when it does not narrow at all. */
export function tiersAtOrAbove(filter: TierFilter): string[] | null {
  if (filter === "all") return null;
  return TIERS_LOW_TO_HIGH.slice(TIERS_LOW_TO_HIGH.indexOf(filter));
}

/**
 * The fans an admin chose: the artist's fans, once each, and when a
 * narrowing list is given (a tier, an event's RSVPs) only those in it.
 * A fan who is not the artist's is never returned.
 */
export function chooseAudienceFanIds(
  artistFanIds: readonly string[],
  narrowToFanIds: readonly string[] | null,
): string[] {
  const unique = [...new Set(artistFanIds)];
  if (narrowToFanIds === null) return unique;
  const narrow = new Set(narrowToFanIds);
  return unique.filter((id) => narrow.has(id));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f]+/g, " ").trim();
}

function reasonLine(message: AudienceMessage): string {
  const artist = oneLine(message.artistName);
  return message.reason === "rsvp"
    ? `You are getting this because you RSVPed to an event with ${artist} on Fan Engage.`
    : `You are getting this because you follow ${artist} on Fan Engage.`;
}

/**
 * One fan's email, with that fan's own unsubscribe link. The admin's text
 * is escaped once and shown with its line breaks kept, so it reads as
 * written and can never add markup of its own.
 */
export function buildAudienceEmail(input: {
  message: AudienceMessage;
  appUrl: string;
  unsubscribeToken: string;
}): { subject: string; text: string; html: string } {
  const { message } = input;
  const reason = reasonLine(message);
  const home = input.appUrl.replace(/\/+$/, "");
  const unsubscribe = `${home}/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;

  const text = [
    message.body,
    reason,
    `If you would rather not get Fan Engage emails, unsubscribe: ${unsubscribe}`,
    "Fan Engage",
  ].join("\n\n");

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.55;color:#0f172a">
<div style="white-space:pre-wrap">${escapeHtml(message.body)}</div>
<p style="margin-top:32px;font-size:12px;color:#64748b">${escapeHtml(reason)}</p>
<p style="font-size:12px;color:#64748b"><a href="${escapeHtml(unsubscribe)}" style="color:#64748b">Unsubscribe from Fan Engage emails</a></p>
</body></html>`;

  return { subject: oneLine(message.subject), text, html };
}
