"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import { broadcastSms } from "@/lib/broadcast";
import {
  emailItemMetadata,
  hasRecentCampaign,
  loadArtistFanIds,
  loadTierFanIds,
  sendAudienceEmail,
} from "@/lib/admin-audience";
import { chooseAudienceFanIds, parseTierFilter, tiersAtOrAbove, type TierFilter } from "@/lib/audience-email";
import {
  DUPLICATE_BROADCAST_MESSAGE,
  describeAudienceSend,
  type EmailOutcome,
  type SmsOutcome,
} from "@/lib/audience-send-outcome";

export type BroadcastFormResult = {
  /** True when at least one message went out. */
  ok: boolean;
  /** One plain line per channel: sent, skipped, failed. */
  lines?: string[];
  error?: string;
};

type BroadcastChannel = "sms" | "email" | "both";

const BROADCAST_CHANNELS: readonly BroadcastChannel[] = ["sms", "email", "both"];
const TITLE_PREVIEW_LENGTH = 60;

export type BroadcastTarget = { slug: string; displayName: string };

/**
 * The community a broadcast from this admin session goes to: always the
 * admin context's current community (never a value from the form).
 */
export async function getBroadcastTarget(): Promise<BroadcastTarget | null> {
  const ctx = await getAdminContext();
  if (!ctx?.currentCommunityId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("communities")
    .select("slug, display_name")
    .eq("slug", ctx.currentCommunityId)
    .maybeSingle();
  return {
    slug: ctx.currentCommunityId,
    displayName: (data?.display_name as string | undefined) ?? ctx.currentCommunityId,
  };
}

function broadcastTitle(message: string): string {
  const preview = message.slice(0, TITLE_PREVIEW_LENGTH);
  return `Broadcast: ${preview}${message.length > TITLE_PREVIEW_LENGTH ? "…" : ""}`;
}

function tierLabel(tier: TierFilter): string {
  return tier === "all" ? "" : `[${tier[0].toUpperCase() + tier.slice(1)}+ fans] `;
}

/**
 * The fans this broadcast is for: the community's followers, and when a
 * tier is picked only those at that tier or above. Text and email both
 * use this one list.
 */
async function loadChosenFanIds(artistSlug: string, tier: TierFilter): Promise<string[]> {
  const tiers = tiersAtOrAbove(tier);
  const [followerIds, tierFanIds] = await Promise.all([
    loadArtistFanIds(artistSlug),
    tiers ? loadTierFanIds(artistSlug, tiers) : Promise.resolve(null),
  ]);
  return chooseAudienceFanIds(followerIds, tierFanIds);
}

/** Text the chosen fans. Never throws. */
async function sendBroadcastSms(body: string, artistSlug: string, fanIds: readonly string[]): Promise<SmsOutcome> {
  try {
    const result = await broadcastSms({ body, messageType: "admin_owner_blast", artistSlug, fanIds });
    return { recipients: result.recipients, sent: result.sent, failed: result.failed, error: result.error ?? null };
  } catch (err) {
    console.error("sendBroadcast: SMS failed for", artistSlug, err);
    return { recipients: 0, sent: 0, failed: 0, error: "something went wrong on our side. Please try again." };
  }
}

async function recordBroadcastItems(
  campaignId: string,
  tier: TierFilter,
  outcome: { sms?: SmsOutcome; email?: EmailOutcome },
): Promise<void> {
  const rows = [
    ...(outcome.sms
      ? [{ item_kind: "sms", metadata: { ...outcome.sms, error: outcome.sms.error ?? null, tier_filter: tier } }]
      : []),
    ...(outcome.email
      ? [{ item_kind: "email", metadata: { ...emailItemMetadata(outcome.email), tier_filter: tier } }]
      : []),
  ].map((row) => ({ ...row, campaign_id: campaignId, ref_id: null }));
  const { error } = await createAdminClient().from("campaign_items").insert(rows);
  if (error) console.error("sendBroadcast: could not save results for campaign", campaignId, error.message);
}

export async function sendBroadcast(
  formData: FormData,
): Promise<BroadcastFormResult> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "Unauthorized" };

  // Target is the admin's current community. Form input is ignored so a
  // tampered field can't redirect a broadcast elsewhere.
  const artistSlug = ctx.currentCommunityId ?? "";
  const message = String(formData.get("message") ?? "").trim();
  const tier = parseTierFilter(String(formData.get("tier_filter") ?? "all"));
  const channel = String(formData.get("channel") ?? "sms") as BroadcastChannel;

  if (!artistSlug) {
    return { ok: false, error: "Pick a community in the admin switcher before broadcasting." };
  }
  if (!message) {
    return { ok: false, error: "Message is required." };
  }
  if (!tier || !BROADCAST_CHANNELS.includes(channel)) {
    return { ok: false, error: "Pick a fan tier and a channel, then try again." };
  }

  // Sending to every opted-in fan is a write with real-world blast radius:
  // minimum role admin in the target community (super-admins pass).
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: "admin" }, ctx);
  if (!guard.ok) {
    return {
      ok: false,
      error: "Only community admins and owners can send broadcasts.",
    };
  }

  const admin = createAdminClient();
  const title = broadcastTitle(message);
  const description = `Tier: ${tier} · Channel: ${channel}`;

  let chosenFanIds: string[];
  try {
    chosenFanIds = await loadChosenFanIds(artistSlug, tier);
    // A double click or a retried submit must not send the same thing twice.
    if (await hasRecentCampaign({ artistSlug, title, description })) {
      return { ok: false, error: DUPLICATE_BROADCAST_MESSAGE };
    }
  } catch (err) {
    console.error("sendBroadcast: could not prepare broadcast for", artistSlug, err);
    return { ok: false, error: "Nothing was sent because the list of fans could not be read. Please try again." };
  }
  if (chosenFanIds.length === 0) {
    return { ok: false, error: "No fans match this choice, so nothing was sent." };
  }

  // The campaign row is written first, as a claim. If it cannot be
  // written, nothing is sent.
  const { data: campaign, error: claimError } = await admin
    .from("campaigns")
    .insert({
      artist_slug: artistSlug,
      title,
      description,
      created_by: ctx.user.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (claimError || !campaign) {
    console.error("sendBroadcast: could not record broadcast for", artistSlug, claimError?.message);
    return { ok: false, error: "Nothing was sent because the broadcast could not be recorded. Please try again." };
  }

  const target = await getBroadcastTarget();
  const body = tierLabel(tier) + message;
  const wantsSms = channel === "sms" || channel === "both";
  const wantsEmail = channel === "email" || channel === "both";
  const [sms, email] = await Promise.all([
    wantsSms ? sendBroadcastSms(body, artistSlug, chosenFanIds) : undefined,
    wantsEmail
      ? sendAudienceEmail(
          {
            subject: `Message from ${target?.displayName ?? artistSlug}`,
            body,
            artistName: target?.displayName ?? artistSlug,
            reason: "follower",
          },
          chosenFanIds,
        )
      : undefined,
  ]);

  await recordBroadcastItems(campaign.id as string, tier, { sms, email });
  return describeAudienceSend({ sms, email });
}
