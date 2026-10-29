"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { communityAdminUser } from "@/lib/admin-guard";
import { indexRowAsync } from "@/lib/embeddings";
import { moderateRowAsync } from "@/lib/moderation";
import { tagRowAsync } from "@/lib/tagging";
import { notifyNewPost } from "@/lib/notifications/triggers/new-post";
import { notifyCommentOnMyPost } from "@/lib/notifications/triggers/comment-on-my-post";

import { findNearestPost, isHardDuplicate } from "@/lib/dedup/check";
import { withPointsProgress } from "@/lib/points/lifetime";
import { resolveAuthorVisibility } from "@/lib/founder-gate/core";
import type { PointsProgress } from "@/lib/points/progress";
import {
  premiumPath,
  requirePremiumFeature,
  type PremiumV1Feature,
} from "@/lib/entitlements";
type Visibility = "public" | "premium" | "founder-only";

/**
 * Return shape for the fan-facing actions that can earn points. Additive:
 * these actions used to resolve to `undefined`, and still do on validation
 * early-returns. On success they resolve to `{ pointsAwarded, lifetimePoints,
 * nextTier }` so the client can show "+10 pts · 1,569 to Gold"
 * (components/points-toast.tsx). Points themselves are still awarded by the
 * SQL triggers — see lib/points/lifetime.ts.
 */
export type PointsActionResult = PointsProgress | undefined;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/**
 * Premium gate for the top-level composer only. Replies, reactions, poll
 * votes and challenge entries are Free (lib/entitlements-core FREE_V1_FEATURES);
 * their per-day point caps are enforced by the SQL award triggers
 * (try_award_comment_points / try_award_poll_points in 0053,
 * award_challenge_entry_points in 0078), not here.
 */
async function requirePremiumCommunityWrite(
  userId: string,
  communityId: string,
  feature: PremiumV1Feature,
) {
  if (await communityAdminUser(communityId, "viewer")) return;
  const gate = await requirePremiumFeature(userId, communityId, feature);
  if (!gate.allowed) {
    redirect(premiumPath(communityId));
  }
}

function normalizeVisibility(raw: FormDataEntryValue | null): Visibility {
  const v = String(raw ?? "public").toLowerCase().trim();
  if (v === "premium" || v === "founder-only") return v;
  return "public";
}

function normalizeUrl(urlRaw: string): string | null {
  const trimmed = urlRaw.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export async function createPostAction(formData: FormData): Promise<PointsActionResult> {
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  // AI alt-text — capture fan-edited image_alt
  const imageAltRaw = String(formData.get("image_alt") ?? "").trim();
  const imageAlt = imageAltRaw.length > 0 ? imageAltRaw.slice(0, 500) : null;

  // AI #5 — capture fan-selected tags from TagSuggester
  const aiSuggestedTagsRaw = String(formData.get("ai_suggested_tags") ?? "");
  const aiSuggestedTags = aiSuggestedTagsRaw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 24);
  const imageUrlRaw = String(formData.get("image_url") ?? "").trim();
  const videoUrlRaw = String(formData.get("video_url") ?? "").trim();
  const videoPosterUrlRaw = String(formData.get("video_poster_url") ?? "").trim();
  // Phase 12: caption_used="1" when fan picked from a Claude vision suggestion.
  const captionUsed = String(formData.get("caption_used") ?? "0") === "1";
  if (!artistSlug || !body) return;
  if (body.length > 2000) return;

  const { supabase, userId } = await requireUser();
  await requirePremiumCommunityWrite(userId, artistSlug, "community_post");
  // Visibility: only a team author (admin_users grant for this community or
  // '*' — the same rule the byline and new-post notification use) may make a
  // post premium / founder-only. Everyone else is forced to 'public'.
  const teamAuthor = await communityAdminUser(artistSlug, "editor");
  const visibility = resolveAuthorVisibility(formData.get("visibility") as string | null, {
    hasTeamGrant: teamAuthor !== null,
  });
  const imageUrl = normalizeUrl(imageUrlRaw);
  const videoUrl = normalizeUrl(videoUrlRaw);
  const videoPosterUrl = normalizeUrl(videoPosterUrlRaw);

  // tags is NOT NULL default '{}' in the DB — an explicit null here fails the
  // constraint and silently killed every fan post, so always send an array.
  const {
    result: { data: created, error: insertErr },
    progress,
  } = await withPointsProgress(userId, () =>
    supabase
      .from("community_posts").insert({
        artist_slug: artistSlug,
        author_id: userId,
        kind: "post",
        body,
        visibility,
        image_url: imageUrl,
        video_url: videoUrl,
        video_poster_url: videoPosterUrl,
        caption_used: captionUsed, tags: aiSuggestedTags.slice(0, 6), image_alt: imageAlt})
      .select("id")
      .single(),
  );
  if (insertErr) {
    console.error("[community] post insert failed", insertErr);
    throw new Error("Your post couldn't be saved. Please try again.");
  }

  // Fire-and-forget — embedding lands within seconds, backfill cron is the
  // safety net if this path fails.
  // AI #20: dedupe — does this post nearly duplicate an existing one?
  if (created) {
    try {
      const dup = await findNearestPost(body, created.id);
      if (dup) {
        const updates: Record<string, unknown> = { duplicate_of: dup.postId };
        if (isHardDuplicate(dup)) {
          updates.moderation_status = "flag_review";
        }
        await createAdminClient().from("community_posts").update(updates).eq("id", created.id);
      }
    } catch (e) {
      console.warn("[ai20] dedupe check failed", e);
    }
  }
  if (created) indexRowAsync("community_posts", created.id);
  if (created) moderateRowAsync("community_posts", created.id);
  if (created) tagRowAsync(created.id);
  if (created) {
    notifyNewPost({ postId: created.id, artistSlug, authorId: userId }).catch(() => {});
  }

  revalidatePath(`/artists/${artistSlug}/community`);
  revalidatePath(`/artists/${artistSlug}`);
  return progress;
}

export async function toggleReactionAction(formData: FormData): Promise<PointsActionResult> {
  const postId = String(formData.get("post_id") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  const artistSlug = String(formData.get("artist_slug") ?? "");
  if (!postId || !emoji || !artistSlug) return;

  const { supabase, userId } = await requireUser();

  // If the fan already reacted with this emoji, remove it (toggle off).
  // Otherwise insert.
  const { data: existing } = await supabase
    .from("community_reactions")
    .select("post_id")
    .eq("post_id", postId)
    .eq("fan_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("community_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("fan_id", userId)
      .eq("emoji", emoji);
    revalidatePath(`/artists/${artistSlug}/community`);
    return undefined; // un-reacting never earns points — no toast
  }

  const { progress } = await withPointsProgress(userId, () =>
    supabase.from("community_reactions").insert({
      post_id: postId,
      fan_id: userId,
      emoji,
    }),
  );

  revalidatePath(`/artists/${artistSlug}/community`);
  return progress;
}

export async function addCommentAction(formData: FormData): Promise<PointsActionResult> {
  const postId = String(formData.get("post_id") ?? "");
  const artistSlug = String(formData.get("artist_slug") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId || !artistSlug || !body) return;
  if (body.length > 1000) return;

  const { supabase, userId } = await requireUser();

  // Phase 3 #3: track AI-drafted comments for A/B analysis. Form sets
  // draft_used="1" when user picked from the drafter chips before
  // posting. False otherwise. Default to false on absent / unparseable.
  const draftUsed = String(formData.get("draft_used") ?? "0") === "1";

  const {
    result: { data: created },
    progress,
  } = await withPointsProgress(userId, () =>
    supabase
      .from("community_comments")
      .insert({
        post_id: postId,
        author_id: userId,
        body,
        draft_used: draftUsed,
      })
      .select("id")
      .single(),
  );

  if (created) indexRowAsync("community_comments", created.id);
  if (created) moderateRowAsync("community_comments", created.id);
  if (created) {
    notifyCommentOnMyPost({
      postId,
      commentId: created.id,
      commenterId: userId,
      artistSlug,
    }).catch(() => {});
  }

  revalidatePath(`/artists/${artistSlug}/community`);
  return progress;
}

export async function deletePostAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const artistSlug = String(formData.get("artist_slug") ?? "");
  if (!postId || !artistSlug) return;

  const { supabase, userId } = await requireUser();
  const adminUser = await communityAdminUser(artistSlug, "editor");

  // Author can delete own; an admin of this community can delete any post
  // in it (via service-role client, scoped to the community).
  if (adminUser) {
    const admin = createAdminClient();
    await admin
      .from("community_posts")
      .delete()
      .eq("id", postId)
      .eq("artist_slug", artistSlug);
  } else {
    await supabase
      .from("community_posts")
      .delete()
      .eq("id", postId)
      .eq("author_id", userId);
  }

  revalidatePath(`/artists/${artistSlug}/community`);
}

// ─── Phase 2a: polls ──────────────────────────────────────────────────────

export async function createPollAction(formData: FormData) {
  // Admin only — regular fans can't create polls in Phase 2a.
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const adminUser = await communityAdminUser(artistSlug, "editor");
  if (!adminUser) return;

  const body = String(formData.get("body") ?? "").trim();
  const visibility = normalizeVisibility(formData.get("visibility"));
  const options = formData
    .getAll("option")
    .map((o) => String(o).trim())
    .filter((o) => o.length > 0);
  if (!artistSlug || !body || options.length < 2 || options.length > 6) return;

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .insert({
      artist_slug: artistSlug,
      author_id: adminUser.id,
      kind: "poll",
      body,
      visibility,
    })
    .select("id")
    .single();
  if (!post) return;


  indexRowAsync("community_posts", post.id);
  moderateRowAsync("community_posts", post.id);
  tagRowAsync(post.id);

  await admin.from("community_poll_options").insert(
    options.map((label, i) => ({
      post_id: post.id,
      label,
      sort_order: i,
    })),
  );

  revalidatePath(`/artists/${artistSlug}/community`);
}

export async function votePollAction(formData: FormData): Promise<PointsActionResult> {
  const postId = String(formData.get("post_id") ?? "");
  const optionId = String(formData.get("option_id") ?? "");
  const artistSlug = String(formData.get("artist_slug") ?? "");
  if (!postId || !optionId || !artistSlug) return;

  const { supabase, userId } = await requireUser();

  // If fan already voted, replace their vote (delete + insert).
  await supabase
    .from("community_poll_votes")
    .delete()
    .eq("post_id", postId)
    .eq("fan_id", userId);

  const { progress } = await withPointsProgress(userId, () =>
    supabase.from("community_poll_votes").insert({
      post_id: postId,
      fan_id: userId,
      option_id: optionId,
    }),
  );

  revalidatePath(`/artists/${artistSlug}/community`);
  return progress;
}

// ─── Phase 2a: challenges ─────────────────────────────────────────────────

export async function createChallengeAction(formData: FormData) {
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const adminUser = await communityAdminUser(artistSlug, "editor");
  if (!adminUser) return;

  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const visibility = normalizeVisibility(formData.get("visibility"));
  if (!artistSlug || !body) return;

  const admin = createAdminClient();
  const { data: created } = await admin
    .from("community_posts")
    .insert({
      artist_slug: artistSlug,
      author_id: adminUser.id,
      kind: "challenge",
      title: title || null,
      body,
      visibility,
    })
    .select("id")
    .single();

  if (created) indexRowAsync("community_posts", created.id);
  if (created) moderateRowAsync("community_posts", created.id);
  if (created) tagRowAsync(created.id);

  revalidatePath(`/artists/${artistSlug}/community`);
}

export async function submitEntryAction(formData: FormData): Promise<PointsActionResult> {
  const postId = String(formData.get("post_id") ?? "");
  const artistSlug = String(formData.get("artist_slug") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const imageUrlRaw = String(formData.get("image_url") ?? "").trim();
  if (!postId || !artistSlug || (!body && !imageUrlRaw)) return;

  const { supabase, userId } = await requireUser();
  const imageUrl = normalizeUrl(imageUrlRaw);

  const { progress } = await withPointsProgress(userId, () =>
    supabase.from("community_challenge_entries").insert({
      post_id: postId,
      fan_id: userId,
      body: body || null,
      image_url: imageUrl,
    }),
  );

  revalidatePath(`/artists/${artistSlug}/community`);
  return progress;
}

// ─── Phase 2a: announcements ──────────────────────────────────────────────

export async function createAnnouncementAction(formData: FormData) {
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const adminUser = await communityAdminUser(artistSlug, "editor");
  if (!adminUser) return;

  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const visibility = normalizeVisibility(formData.get("visibility"));
  const imageUrlRaw = String(formData.get("image_url") ?? "").trim();
  const videoUrlRaw = String(formData.get("video_url") ?? "").trim();
  const videoPosterUrlRaw = String(formData.get("video_poster_url") ?? "").trim();
  if (!artistSlug || !body) return;

  const imageUrl = normalizeUrl(imageUrlRaw);
  const videoUrl = normalizeUrl(videoUrlRaw);
  const videoPosterUrl = normalizeUrl(videoPosterUrlRaw);

  const admin = createAdminClient();
  const { data: created } = await admin
    .from("community_posts")
    .insert({
      artist_slug: artistSlug,
      author_id: adminUser.id,
      kind: "announcement",
      title: title || null,
      body,
      pinned: true, // announcements are pinned by default
      visibility,
      image_url: imageUrl,
      video_url: videoUrl,
      video_poster_url: videoPosterUrl,
    })
    .select("id")
    .single();

  if (created) indexRowAsync("community_posts", created.id);
  if (created) moderateRowAsync("community_posts", created.id);
  if (created) tagRowAsync(created.id);

  revalidatePath(`/artists/${artistSlug}/community`);
}

export async function togglePinAction(formData: FormData) {
  // Admin only — pins a post to the top of an artist's feed.
  const postId = String(formData.get("post_id") ?? "");
  const artistSlug = String(formData.get("artist_slug") ?? "");
  const currentlyPinned = String(formData.get("currently_pinned") ?? "false") === "true";
  if (!postId || !artistSlug) return;

  if (!(await communityAdminUser(artistSlug, "editor"))) return;

  const admin = createAdminClient();
  await admin
    .from("community_posts")
    .update({ pinned: !currentlyPinned })
    .eq("id", postId)
    .eq("artist_slug", artistSlug);

  revalidatePath(`/artists/${artistSlug}/community`);
}
