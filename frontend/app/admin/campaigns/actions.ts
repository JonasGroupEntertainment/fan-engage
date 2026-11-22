"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-guard";
import { broadcastSms } from "@/lib/broadcast";
import {
  emailItemMetadata,
  eventBelongsToArtist,
  hasRecentCampaign,
  loadArtistFanIds,
  loadEventRsvpFanIds,
  sendAudienceEmail,
} from "@/lib/admin-audience";
import { chooseAudienceFanIds } from "@/lib/audience-email";
import type { AudienceEmailResult } from "@/lib/audience-email-send";
import { sendDeadline } from "@/lib/send-budget";
import {
  DUPLICATE_CAMPAIGN_MESSAGE,
  describeAudienceSend,
  type AudienceSendOutcome,
  type SmsOutcome,
} from "@/lib/audience-send-outcome";
import { createNotification } from "@/lib/data/notifications";
import { eventOwnerColumns } from "@/lib/events/build-event-row";

/**
 * Campaign builder — single "Publish" action fans out into community posts,
 * offers, fan_actions (CTAs), optional email/SMS blasts, and records a
 * campaign_items row per side-effect for reporting.
 */
const CAMPAIGN_ROLE = "admin" as const;

const CHECK_FAILED_MESSAGE =
  "The campaign was not published because it could not be checked first. Please try again.";
const FANS_NOT_READ_EMAIL_RESULT: AudienceEmailResult = {
  configured: true,
  chosen: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  notSent: 0,
  error: "could not read the chosen fans",
};
const EVENT_NOT_ARTISTS_MESSAGE =
  "That event does not belong to this artist, so the campaign was not published.";

/**
 * The fans a campaign's email and in-app notice are for: fans who RSVPed
 * to the attached event when that option is on, otherwise everyone who
 * follows the artist. Once each. Null when the list could not be read.
 */
async function loadCampaignFanIds(artistSlug: string, rsvpEventId: string | null): Promise<string[] | null> {
  try {
    const fanIds = rsvpEventId ? await loadEventRsvpFanIds(rsvpEventId) : await loadArtistFanIds(artistSlug);
    return chooseAudienceFanIds(fanIds, null);
  } catch (err) {
    console.error("campaign: could not read the chosen fans for", artistSlug, err);
    return null;
  }
}

const FANS_NOT_READ_SMS_RESULT: SmsOutcome = {
  recipients: 0,
  sent: 0,
  failed: 0,
  error: "the list of fans could not be read. Please try again.",
};

/**
 * Text the campaign's fans: the same list the email uses, so the two can
 * never drift apart. An empty list texts nobody. Never throws.
 */
async function sendCampaignSms(
  body: string,
  artistSlug: string,
  fanIds: readonly string[],
  deadlineAt: number,
): Promise<SmsOutcome> {
  try {
    const result = await broadcastSms({ body, messageType: "campaign_sms", artistSlug, fanIds, deadlineAt });
    return {
      recipients: result.recipients,
      sent: result.sent,
      failed: result.failed,
      notSent: result.notSent ?? 0,
      error: result.error ?? null,
    };
  } catch (err) {
    console.error("campaign: SMS failed for", artistSlug, err);
    return { recipients: 0, sent: 0, failed: 0, error: "something went wrong on our side. Please try again." };
  }
}

function parseJsonBlock<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function createAndPublishCampaign(formData: FormData) {
  const deadlineAt = sendDeadline();
  const supa = createAdminClient();

  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!artistSlug || !title) return { success: false as const, error: "Artist and title are required." };
  // Campaigns post, email and text on the artist's behalf, so the caller
  // must administer that artist's community.
  const { user: admin } = await assertAdmin({ communityId: artistSlug, minRole: CAMPAIGN_ROLE });

  // Before anything is created: an attached event must be this artist's
  // own (its RSVPs can become the audience), and a double click or a
  // retried submit must not publish and send the same campaign twice.
  const existingEventId = String(formData.get("existing_event_id") ?? "").trim();
  try {
    if (existingEventId && !(await eventBelongsToArtist(existingEventId, artistSlug))) {
      return { success: false as const, error: EVENT_NOT_ARTISTS_MESSAGE };
    }
    if (await hasRecentCampaign({ artistSlug, title })) {
      return { success: false as const, error: DUPLICATE_CAMPAIGN_MESSAGE };
    }
  } catch (err) {
    console.error("campaign: pre-publish checks failed for", artistSlug, err);
    return { success: false as const, error: CHECK_FAILED_MESSAGE };
  }

  // 1) Create the campaign row
  const { data: campaign } = await supa
    .from("campaigns")
    .insert({
      artist_slug: artistSlug,
      title,
      description: description || null,
      created_by: admin.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (!campaign) return { success: false as const, error: "Failed to create campaign." };

  const campaignId = campaign.id as string;

  const recordItem = async (kind: string, refId: string | null, meta: Record<string, unknown> = {}) => {
    await supa.from("campaign_items").insert({
      campaign_id: campaignId,
      item_kind: kind,
      ref_id: refId,
      metadata: meta,
    });
  };

  // 2) Announcement (optional)
  const announcementBody = String(formData.get("announcement_body") ?? "").trim();
  if (announcementBody) {
    const announcementTitle = String(formData.get("announcement_title") ?? "").trim();
    const { data: post } = await supa
      .from("community_posts")
      .insert({
        artist_slug: artistSlug,
        author_id: admin.id,
        kind: "announcement",
        title: announcementTitle || title,
        body: announcementBody,
        pinned: true,
      })
      .select("id")
      .single();
    if (post) await recordItem("announcement", post.id as string);
  }

  // 3) Poll (optional) — JSON block: { question, options: [] }
  const poll = parseJsonBlock<{ question?: string; options?: string[] }>(
    formData.get("poll_json"),
    {},
  );
  if (poll.question && poll.options && poll.options.length >= 2) {
    const { data: post } = await supa
      .from("community_posts")
      .insert({
        artist_slug: artistSlug,
        author_id: admin.id,
        kind: "poll",
        body: poll.question,
      })
      .select("id")
      .single();
    if (post) {
      await supa.from("community_poll_options").insert(
        poll.options
          .filter((o) => o.trim())
          .slice(0, 6)
          .map((label, i) => ({ post_id: post.id, label: label.trim(), sort_order: i })),
      );
      await recordItem("poll", post.id as string);
    }
  }

  // 4) Challenge (optional)
  const challengeBody = String(formData.get("challenge_body") ?? "").trim();
  if (challengeBody) {
    const challengeTitle = String(formData.get("challenge_title") ?? "").trim();
    const { data: post } = await supa
      .from("community_posts")
      .insert({
        artist_slug: artistSlug,
        author_id: admin.id,
        kind: "challenge",
        title: challengeTitle || null,
        body: challengeBody,
      })
      .select("id")
      .single();
    if (post) await recordItem("challenge", post.id as string);
  }

  // 5) Marketplace offer (optional)
  const offerTitle = String(formData.get("offer_title") ?? "").trim();
  if (offerTitle) {
    const offerSlug = (String(formData.get("offer_slug") ?? "").trim() ||
      offerTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)) +
      "-" + Date.now().toString(36);
    const pricePoints = parseInt(String(formData.get("offer_price_points") ?? "0"), 10) || null;
    const category = String(formData.get("offer_category") ?? "merch");
    const minTier = String(formData.get("offer_min_tier") ?? "bronze");
    const { data: offer } = await supa
      .from("offers")
      .insert({
        community_id: artistSlug,
        slug: offerSlug,
        title: offerTitle,
        description: String(formData.get("offer_description") ?? ""),
        category,
        price_points: pricePoints,
        min_tier: minTier,
        active: true,
      })
      .select("id")
      .single();
    if (offer) await recordItem("offer", offer.id as string);
  }

  // 6) Fan actions / CTAs — JSON block: [{ kind, title, url, cta_label, point_value }]
  const ctas = parseJsonBlock<
    Array<{
      kind: string;
      title: string;
      description?: string;
      url?: string;
      cta_label?: string;
      point_value?: number;
    }>
  >(formData.get("ctas_json"), []);
  for (const cta of ctas) {
    if (!cta.title || !cta.kind) continue;
    const { data: action } = await supa
      .from("fan_actions")
      .insert({
        campaign_id: campaignId,
        artist_slug: artistSlug,
        kind: cta.kind,
        title: cta.title,
        description: cta.description ?? null,
        url: cta.url ?? null,
        cta_label: cta.cta_label ?? "Complete",
        point_value: cta.point_value ?? 25,
        active: true,
      })
      .select("id")
      .single();
    if (action) await recordItem("action", action.id as string, { kind: cta.kind });
  }

  // 7) Event (optional) — either create a new one or reference an existing id.
  //    When an event is attached, the email, SMS and in-app notice below
  //    go to its RSVPers (instead of all artist followers) if
  //    "target_event_rsvpers" is on.
  let attachedEventId: string | null = null;
  const eventTitle = String(formData.get("event_title") ?? "").trim();
  if (eventTitle) {
    const capacity = parseInt(String(formData.get("event_capacity") ?? ""), 10);
    const startsAt = String(formData.get("event_starts_at") ?? "").trim();
    const location = String(formData.get("event_location") ?? "").trim();
    const dateText = String(formData.get("event_date_text") ?? "").trim();
    const eventUrl = String(formData.get("event_url") ?? "").trim();
    const detail = String(formData.get("event_detail") ?? "").trim();
    const { data: ev } = await supa
      .from("artist_events")
      .insert({
        ...eventOwnerColumns(artistSlug),
        title: eventTitle,
        detail: detail || null,
        event_date: dateText || null,
        starts_at: startsAt || null,
        location: location || null,
        url: eventUrl || null,
        capacity: Number.isFinite(capacity) ? capacity : null,
      })
      .select("id")
      .single();
    if (ev) {
      attachedEventId = ev.id as string;
      await recordItem("event", attachedEventId, { title: eventTitle });
    }
  } else if (existingEventId) {
    attachedEventId = existingEventId;
    await recordItem("event", attachedEventId, { reused: true });
  }

  const targetEventRsvpers =
    String(formData.get("target_event_rsvpers") ?? "false") === "true" &&
    attachedEventId !== null;

  const rsvpEventId = targetEventRsvpers ? attachedEventId : null;
  const [campaignFanIds, artistRow] = await Promise.all([
    loadCampaignFanIds(artistSlug, rsvpEventId),
    supa.from("artists").select("name").eq("slug", artistSlug).maybeSingle(),
  ]);
  const artistName = (artistRow.data?.name as string | null | undefined) ?? artistSlug;

  // 8) In-app inbox notification for every fan this campaign targets.
  //    Sent before the email and text so a long send can never cut it off.
  //    Audience: artist followers when no event is attached; event RSVPers
  //    when targetEventRsvpers is on. Dedup'd by campaign_id so a fan can
  //    never see the same campaign twice in their inbox.
  try {
    const body =
      String(formData.get("announcement_body") ?? "").trim().slice(0, 140) ||
      description ||
      "New artist drop";
    await Promise.all(
      (campaignFanIds ?? []).map((fanId) =>
        createNotification({
          fanId,
          kind: "campaign",
          title,
          body,
          url: `/artists/${artistSlug}/community`,
          icon: "📣",
          dedupKey: `campaign:${campaignId}`,
          communityId: artistSlug,
        }),
      ),
    );
  } catch (err) {
    console.warn("campaign fan-out (notifications) failed:", err);
  }

  // 9) Email blast: one email per chosen fan who may be emailed, each with
  //    their own unsubscribe link. Never a Mailchimp campaign, which would
  //    reach the whole audience (every artist, RSVP or not).
  // 10) SMS blast: opted-in adults through Mailchimp (throttled). Promotional.
  //    Email and text use the same fan list and run side by side, so they
  //    share the time budget fairly.
  const emailSubject = String(formData.get("email_subject") ?? "").trim();
  const emailBody = String(formData.get("email_body") ?? "").trim();
  const smsBody = String(formData.get("sms_body") ?? "").trim();
  const wantsEmail = Boolean(emailSubject && emailBody);
  const [emailResult, smsResult] = await Promise.all([
    !wantsEmail
      ? undefined
      : campaignFanIds === null
        ? FANS_NOT_READ_EMAIL_RESULT
        : sendAudienceEmail(
            { subject: emailSubject, body: emailBody, artistName, reason: rsvpEventId ? "rsvp" : "follower" },
            campaignFanIds,
            deadlineAt,
          ),
    !smsBody
      ? undefined
      : campaignFanIds === null
        ? FANS_NOT_READ_SMS_RESULT
        : sendCampaignSms(smsBody, artistSlug, campaignFanIds, deadlineAt),
  ]);
  if (emailResult) {
    await recordItem("email", null, {
      subject: emailSubject,
      body: emailBody,
      ...emailItemMetadata(emailResult),
      targeted_event_id: rsvpEventId,
    });
  }
  if (smsResult) {
    await recordItem("sms", null, {
      body: smsBody,
      sent: smsResult.sent,
      failed: smsResult.failed,
      not_sent: smsResult.notSent ?? 0,
      recipients: smsResult.recipients,
      targeted_event_id: rsvpEventId,
      error: smsResult.error ?? null,
    });
  }

  revalidatePath("/admin/campaigns");
  revalidatePath(`/artists/${artistSlug}/community`);
  revalidatePath(`/artists/${artistSlug}`);
  // What went out, in plain words, when the campaign carried an email or a
  // text. The builder shows these instead of jumping straight to the list.
  const outcome: AudienceSendOutcome = {
    email: emailResult,
    sms: smsResult,
    inApp: campaignFanIds?.length,
  };
  const sendLines = emailResult || smsResult ? describeAudienceSend(outcome).lines : [];
  return { success: true as const, campaignId, sendLines };
}

export async function deactivateCampaignAction(formData: FormData) {
  const campaignId = String(formData.get("campaign_id") ?? "");
  if (!campaignId) return;
  const supa = createAdminClient();
  const { data: campaign } = await supa
    .from("campaigns")
    .select("artist_slug")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return;
  await assertAdmin({ communityId: campaign.artist_slug as string, minRole: CAMPAIGN_ROLE });
  // Set ends_at to now + deactivate linked fan_actions
  await supa
    .from("campaigns")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", campaignId);
  await supa
    .from("fan_actions")
    .update({ active: false })
    .eq("campaign_id", campaignId);
  revalidatePath("/admin/campaigns");
}
