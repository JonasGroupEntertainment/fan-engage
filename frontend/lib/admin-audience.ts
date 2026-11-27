import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/app-url";
import { mandrillConfigured, sendMandrillBatch } from "@/lib/email/transactional";
import { pageAll, pageAllIn } from "@/lib/supabase/page-all";
import type { AudienceMessage } from "@/lib/audience-email";
import { sendAudienceEmails, type AudienceEmailResult } from "@/lib/audience-email-send";
import { duplicateSendCutoffIso } from "@/lib/audience-send-outcome";
import type { ReminderFanRow } from "@/lib/event-reminder-email";
import { MARKETING_EMAIL_CONSENT_COLUMN } from "@/lib/marketing-consent";

/**
 * Reads and sends behind the two admin screens that write to one artist's
 * fans (Broadcast and the campaign builder). Every list is paged, so an
 * artist with more than 1,000 fans is seen whole. The rules live in
 * lib/audience-email.ts and lib/audience-email-send.ts.
 */

export const AUDIENCE_EMAIL_TAGS = ["admin-audience-email"] as const;

const AUDIENCE_FAN_COLUMNS =
  "id, email, first_name, email_opted_in, suspended, is_internal, unsubscribe_token";

/** Only an active membership counts for a tier (not suspended, not pending). */
const ACTIVE_MEMBERSHIP = "active";

type FanIdRow = { fan_id: string };

function fanIdsOrThrow(
  table: string,
  result: { data: FanIdRow[]; error: null } | { data: null; error: { message: string } },
): string[] {
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data.map((row) => row.fan_id);
}

/** An artist's fans: everyone who follows the artist. Throws on a failed read. */
export async function loadArtistFanIds(artistSlug: string): Promise<string[]> {
  const admin = createAdminClient();
  const rows = await pageAll<FanIdRow>(() =>
    admin
      .from("fan_artist_following")
      .select("fan_id")
      .eq("artist_slug", artistSlug)
      .order("fan_id", { ascending: true }),
  );
  return fanIdsOrThrow("fan_artist_following", rows);
}

/** Active members of the artist's community in any of `tiers`. Throws on a failed read. */
export async function loadTierFanIds(artistSlug: string, tiers: readonly string[]): Promise<string[]> {
  const admin = createAdminClient();
  const rows = await pageAll<FanIdRow>(() =>
    admin
      .from("fan_community_memberships")
      .select("fan_id")
      .eq("community_id", artistSlug)
      .in("current_tier", [...tiers])
      .eq("status", ACTIVE_MEMBERSHIP)
      .order("fan_id", { ascending: true }),
  );
  return fanIdsOrThrow("fan_community_memberships", rows);
}

/** Everyone who RSVPed to the event. Throws on a failed read. */
export async function loadEventRsvpFanIds(eventId: string): Promise<string[]> {
  const admin = createAdminClient();
  const rows = await pageAll<FanIdRow>(() =>
    admin
      .from("event_rsvps")
      .select("fan_id")
      .eq("event_id", eventId)
      .order("fan_id", { ascending: true }),
  );
  return fanIdsOrThrow("event_rsvps", rows);
}

/** True when the event exists and belongs to the artist. Throws on a failed read. */
export async function eventBelongsToArtist(eventId: string, artistSlug: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("artist_events")
    .select("id")
    .eq("id", eventId)
    .eq("artist_slug", artistSlug)
    .limit(1);
  if (error) throw new Error(`artist_events: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * The fans rows for the chosen ids. The email gates are applied here and
 * again in selectReminderEmailRecipients.
 *
 * Admin broadcast and campaign email is marketing, so it also needs a
 * recorded email consent (lib/marketing-consent.ts): a fan the old join
 * form opted in without a tick is not emailed. If the consent column does
 * not exist yet (migration 0109) this read fails and nothing is sent.
 */
async function loadEmailFans(fanIds: readonly string[]): Promise<ReminderFanRow[]> {
  const admin = createAdminClient();
  const fans = await pageAllIn<ReminderFanRow, string>(fanIds, (part) =>
    admin
      .from("fans")
      .select(AUDIENCE_FAN_COLUMNS)
      .in("id", part)
      .eq("email_opted_in", true)
      .not(MARKETING_EMAIL_CONSENT_COLUMN, "is", null)
      .eq("suspended", false)
      .eq("is_internal", false)
      .order("id", { ascending: true }),
  );
  if (fans.error) throw new Error(`fans: ${fans.error.message}`);
  return fans.data;
}

/**
 * Email the chosen fans, one message each through Mandrill. This must not
 * go through a Mailchimp campaign: that reaches the whole audience, every
 * artist and every tier. Never throws.
 */
export async function sendAudienceEmail(
  message: AudienceMessage,
  chosenFanIds: readonly string[],
  deadlineAt: number,
): Promise<AudienceEmailResult> {
  const result = await sendAudienceEmails({
    message,
    appUrl: APP_URL,
    providerReady: mandrillConfigured(),
    loadAudience: async () => ({ chosenFanIds, fans: await loadEmailFans(chosenFanIds) }),
    send: (recipients) => sendMandrillBatch(recipients, AUDIENCE_EMAIL_TAGS),
    deadlineAt,
  });
  if (result.error) console.warn("admin audience email:", result.error);
  return result;
}

/** What is saved about an email send, for the campaigns list. */
export function emailItemMetadata(result: AudienceEmailResult): Record<string, unknown> {
  return {
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
    not_sent: result.notSent,
    recipients: result.chosen,
    error: result.configured ? result.error : "email is not set up (the mail key is missing)",
  };
}

/**
 * True when a campaign row with the same artist, title and (when given)
 * description was written in the last few minutes: a double click, or the
 * form sending the same thing again. Throws on a failed read.
 */
export async function hasRecentCampaign(match: {
  artistSlug: string;
  title: string;
  description?: string;
}): Promise<boolean> {
  const base = createAdminClient()
    .from("campaigns")
    .select("id")
    .eq("artist_slug", match.artistSlug)
    .eq("title", match.title)
    .gte("created_at", duplicateSendCutoffIso());
  const query = match.description === undefined ? base : base.eq("description", match.description);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(`campaigns: ${error.message}`);
  return (data ?? []).length > 0;
}
