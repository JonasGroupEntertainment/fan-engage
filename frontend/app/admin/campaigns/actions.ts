"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";
import { broadcastEmail, broadcastSms } from "@/lib/broadcast";
import { createNotification } from "@/lib/data/notifications";

/**
 * Campaign builder — single "Publish" action fans out into community posts,
 * offers, fan_actions (CTAs), optional email/SMS blasts, and records a
 * campaign_items row per side-effect for reporting.
 */
async function requireAdmin() {
  const admin = await getAdminUser();
  if (!admin) throw new Error("Forbidden");
  return admin;
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
  const admin = await requireAdmin();
  const supa = createAdminClient();

  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!artistSlug || !title) return { success: false as const, error: "Artist and title are required." };

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
  //    When an event is attached, the SMS blast below will target its RSVPers
  //    (instead of all artist followers) if "target_event_rsvpers" is on.
  let attachedEventId: string | null = null;
  const eventTitle = String(formData.get("event_title") ?? "").trim();
  const existingEventId = String(formData.get("existing_event_id") ?? "").trim();
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
        artist_slug: artistSlug,
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

  // 8) Email blast — create + send a Mailchimp regular campaign
  const emailSubject = String(formData.get("email_subject") ?? "").trim();
  const emailBody = String(formData.get("email_body") ?? "").trim();
  if (emailSubject && emailBody) {
    const result = await broadcastEmail({ subject: emailSubject, body: emailBody });
    await recordItem("email", null, {
      subject: emailSubject,
      body: emailBody,
      sent: result.sent,
      recipients: result.recipients,
      error: result.error ?? null,
    });
  }

  // 9) SMS blast — iterate opted-in fans via Twilio (throttled).
  //    Honors the per-event RSVP filter when attached.
  const smsBody = String(formData.get("sms_body") ?? "").trim();
  if (smsBody) {
    const result = await broadcastSms({
      body: smsBody,
      artistSlug,
      eventId: targetEventRsvpers ? attachedEventId : null,
    });
    await recordItem("sms", null, {
      body: smsBody,
      sent: result.sent,
      failed: result.failed,
      recipients: result.recipients,
      targeted_event_id: targetEventRsvpers ? attachedEventId : null,
      error: result.error ?? null,
    });
  }

  // 10) In-app inbox notification for every fan this campaign targets.
  //     Audience: artist followers when no event is attached; event RSVPers
  //     when targetEventRsvpers is on. Dedup'd by campaign_id so a fan can
  //     never see the same campaign twice in their inbox.
  try {
    let audienceFanIds: string[] = [];
    if (targetEventRsvpers && attachedEventId) {
      const { data: rsvpers } = await supa
        .from("event_rsvps")
        .select("fan_id")
        .eq("event_id", attachedEventId);
      audienceFanIds = (rsvpers ?? []).map((r) => r.fan_id as string);
    } else {
      const { data: followers } = await supa
        .from("fan_artist_following")
        .select("fan_id")
        .eq("artist_slug", artistSlug);
      audienceFanIds = (followers ?? []).map((r) => r.fan_id as string);
    }

    const body =
      String(formData.get("announcement_body") ?? "").trim().slice(0, 140) ||
      description ||
      "New artist drop";
    await Promise.all(
      audienceFanIds.map((fanId) =>
        createNotification({
          fanId,
          kind: "campaign",
          title,
          body,
          url: `/artists/${artistSlug}/community`,
          icon: "📣",
          dedupKey: `campaign:${campaignId}`,
        }),
      ),
    );
  } catch (err) {
    console.warn("campaign fan-out (notifications) failed:", err);
  }

  revalidatePath("/admin/campaigns");
  revalidatePath(`/artists/${artistSlug}/community`);
  revalidatePath(`/artists/${artistSlug}`);
  return { success: true as const, campaignId };
}

export async function deactivateCampaignAction(formData: FormData) {
  await requireAdmin();
  const campaignId = String(formData.get("campaign_id") ?? "");
  if (!campaignId) return;
  const supa = createAdminClient();
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
