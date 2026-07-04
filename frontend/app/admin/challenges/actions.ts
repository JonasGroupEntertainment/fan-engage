"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";
import { awardPoints } from "@/lib/points/award";
import { createNotification } from "@/lib/data/notifications";

const WINNER_BONUS_POINTS = 200;

export async function pickWinnerAction(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const postId = String(formData.get("post_id") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const fanId = String(formData.get("fan_id") ?? "");
  if (!postId || !entryId || !fanId) return;

  const supa = createAdminClient();

  // Record the winner via campaign_items (item_kind='challenge_winner'), guard against dupes.
  const { data: existing } = await supa
    .from("campaign_items")
    .select("id")
    .eq("item_kind", "challenge_winner")
    .eq("ref_id", postId)
    .limit(1);
  if (existing && existing.length > 0) return;

  await supa.from("campaign_items").insert({
    campaign_id: null,
    item_kind: "challenge_winner",
    ref_id: postId,
    metadata: { entry_id: entryId, fan_id: fanId },
  });

  // Fetch the post up front — its artist_slug tells us which community
  // the winner bonus belongs to, and we reuse title/body for the notification.
  const { data: post } = await supa
    .from("community_posts")
    .select("artist_slug, title, body")
    .eq("id", postId)
    .maybeSingle();
  const artistSlug = (post?.artist_slug as string | null) ?? "";

  // Award bonus points via ledger; idempotent guard.
  const refId = `challenge_winner:${postId}:${fanId}`;
  const { data: ledgerExists } = await supa
    .from("points_ledger")
    .select("id")
    .eq("source_ref", refId)
    .limit(1);
  if (!ledgerExists || ledgerExists.length === 0) {
    await awardPoints(supa, {
      fanId,
      delta: WINNER_BONUS_POINTS,
      source: "challenge",
      sourceRef: refId,
      note: "Challenge winner bonus",
      ...(artistSlug ? { communityId: artistSlug } : {}),
    });
  }

  // In-app notification for the winner — same dedup_key pattern as the
  // ledger guard, so repeated clicks never spam the fan's inbox.
  const postTitle = (post?.title as string | null) ?? null;
  const postBody = (post?.body as string | null) ?? "";
  await createNotification({
    fanId: fanId,
    kind: "challenge_winner",
    title: "🎉 You won the challenge!",
    body:
      `${postTitle ?? (postBody.slice(0, 60) || "Your entry")} — +${WINNER_BONUS_POINTS} bonus points.`,
    url: artistSlug ? `/artists/${artistSlug}/community` : "/rewards",
    icon: "🏆",
    dedupKey: `challenge_winner:${postId}:${fanId}`,
  });

  revalidatePath("/admin/challenges");
  revalidatePath("/admin/community");
}
