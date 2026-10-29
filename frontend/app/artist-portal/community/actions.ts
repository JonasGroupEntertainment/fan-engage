"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPortalRole } from "@/lib/artist-portal/access";
import { buildCommunityPostRow, readPostInput } from "@/lib/community/post-input";
import { findNearestPost, isHardDuplicate } from "@/lib/dedup/check";
import { indexRowAsync } from "@/lib/embeddings";
import { moderateRowAsync } from "@/lib/moderation";
import { tagRowAsync } from "@/lib/tagging";
import { notifyNewPost } from "@/lib/notifications/triggers/new-post";

/**
 * Artist-portal composer actions (Sprint 4 item A).
 *
 * Every action resolves the caller's portal context through
 * assertPortalRole("communityPost") — editor and above, on the one community
 * the grant is for — and scopes every write to ctx.communityId, so a team
 * member can never touch another artist's posts. Portal roles live in
 * admin_users (lib/artist-portal/access.ts getPortalContext), the same table
 * the byline (lib/data/community.ts getTeamAuthoredPostIds) and the new-post
 * notification (lib/notifications/triggers/new-post.ts) read, so a portal
 * author is a team author everywhere without extra plumbing.
 */

export type PortalPostResult =
  | { ok: true; postId: string; scheduledFor: string | null }
  | { ok: false; error: string };

function revalidateCommunity(slug: string) {
  revalidatePath("/artist-portal/community");
  revalidatePath(`/artists/${slug}/community`);
  revalidatePath(`/artists/${slug}`);
}

/**
 * Create a post / announcement / poll / challenge from the portal. Same row
 * shape as the fan composer's createPostAction (lib/community/post-input.ts).
 * A future `scheduled_for` keeps the row out of the public feed (0094 RLS +
 * app filters) and defers the follower notification to
 * /api/cron/publish-scheduled-posts.
 */
export async function createPortalPostAction(formData: FormData): Promise<PortalPostResult> {
  const ctx = await assertPortalRole("communityPost");
  const artistSlug = ctx.communityId;

  const input = readPostInput(formData);
  const built = buildCommunityPostRow(input, {
    artistSlug,
    authorId: ctx.user.id,
    hasTeamGrant: true,
  });
  if (!built.ok) {
    const msg =
      built.reason === "empty_body"
        ? "Write something first."
        : built.reason === "body_too_long"
          ? "Posts are limited to 2,000 characters."
          : "A poll needs between 2 and 6 options.";
    return { ok: false, error: msg };
  }

  const admin = createAdminClient();
  const { data: created, error: insertErr } = await admin
    .from("community_posts")
    .insert(built.row)
    .select("id")
    .single();
  if (insertErr || !created) {
    console.error("[artist-portal] post insert failed", insertErr);
    return { ok: false, error: "Your post couldn't be saved. Please try again." };
  }
  const postId = created.id as string;

  if (built.pollOptions.length > 0) {
    await admin.from("community_poll_options").insert(
      built.pollOptions.map((label, i) => ({ post_id: postId, label, sort_order: i })),
    );
  }

  // Same post-insert pipeline as the fan composer: dedupe, embed, moderate, tag.
  try {
    const dup = await findNearestPost(built.row.body, postId);
    if (dup) {
      const updates: Record<string, unknown> = { duplicate_of: dup.postId };
      if (isHardDuplicate(dup)) updates.moderation_status = "flag_review";
      await admin.from("community_posts").update(updates).eq("id", postId);
    }
  } catch (e) {
    console.warn("[artist-portal] dedupe check failed", e);
  }
  indexRowAsync("community_posts", postId);
  moderateRowAsync("community_posts", postId);
  tagRowAsync(postId);

  // Scheduled posts are announced by the cron when due — never here.
  if (built.notifyAtCreate) {
    notifyNewPost({ postId, artistSlug, authorId: ctx.user.id }).catch(() => {});
  }

  // "Use this draft" — close the loop on the AI draft the post came from.
  const draftId = String(formData.get("draft_id") ?? "").trim();
  if (draftId) {
    await admin
      .from("artist_post_drafts")
      .update({
        status: "published",
        reviewed_by: ctx.user.id,
        reviewed_at: new Date().toISOString(),
        published_post_id: postId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("artist_slug", artistSlug)
      .eq("status", "pending");
    revalidatePath("/admin/post-drafts");
  }

  revalidateCommunity(artistSlug);
  return { ok: true, postId, scheduledFor: built.row.scheduled_for ?? null };
}

/** Delete any post in this community (editor+). */
export async function deletePortalPostAction(formData: FormData): Promise<void> {
  const ctx = await assertPortalRole("communityPost");
  const postId = String(formData.get("post_id") ?? "").trim();
  if (!postId) return;
  await createAdminClient()
    .from("community_posts")
    .delete()
    .eq("id", postId)
    .eq("artist_slug", ctx.communityId);
  revalidateCommunity(ctx.communityId);
}

/**
 * Publish a scheduled post right now. Two cases, both claim-first so the
 * push can never go out twice (the cron uses the same claim):
 *   - still in the future: pull scheduled_for / created_at to now and stamp
 *     announced_at, then notify;
 *   - already due but not yet picked up by the 5-minute cron: just claim
 *     announced_at (where still null), then notify.
 */
export async function publishScheduledPostNowAction(formData: FormData): Promise<void> {
  const ctx = await assertPortalRole("communityPost");
  const postId = String(formData.get("post_id") ?? "").trim();
  if (!postId) return;
  const nowIso = new Date().toISOString();
  const admin = createAdminClient();

  const { data: post } = await admin
    .from("community_posts")
    .select("id, scheduled_for, announced_at")
    .eq("id", postId)
    .eq("artist_slug", ctx.communityId)
    .not("scheduled_for", "is", null)
    .maybeSingle();
  if (!post || post.announced_at) {
    revalidateCommunity(ctx.communityId);
    return;
  }

  const stillFuture = Date.parse(post.scheduled_for as string) > Date.parse(nowIso);
  const { data: claimed } = await admin
    .from("community_posts")
    .update(
      stillFuture
        ? { scheduled_for: nowIso, created_at: nowIso, announced_at: nowIso }
        : { announced_at: nowIso },
    )
    .eq("id", postId)
    .eq("artist_slug", ctx.communityId)
    .is("announced_at", null)
    .select("id")
    .maybeSingle();
  if (claimed) {
    await notifyNewPost({ postId, artistSlug: ctx.communityId, authorId: ctx.user.id });
  }
  revalidateCommunity(ctx.communityId);
}

/**
 * Unschedule = remove the not-yet-published post. It never reached fans and
 * there is no draft state on community_posts, so deleting is the honest
 * outcome. If the post came from an AI draft ("Use this draft"), the draft
 * goes back to 'pending' so it reappears in "Drafts for you" instead of
 * being lost.
 */
export async function unschedulePostAction(formData: FormData): Promise<void> {
  const ctx = await assertPortalRole("communityPost");
  const postId = String(formData.get("post_id") ?? "").trim();
  if (!postId) return;
  const admin = createAdminClient();
  // Look the draft up BEFORE deleting: the FK is `on delete set null`, so
  // published_post_id is gone once the post is.
  const { data: draft } = await admin
    .from("artist_post_drafts")
    .select("id")
    .eq("published_post_id", postId)
    .eq("artist_slug", ctx.communityId)
    .maybeSingle();
  const { data: removed } = await admin
    .from("community_posts")
    .delete()
    .eq("id", postId)
    .eq("artist_slug", ctx.communityId)
    .gt("scheduled_for", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (removed && draft) {
    await admin
      .from("artist_post_drafts")
      .update({
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        published_post_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id as string);
    revalidatePath("/admin/post-drafts");
  }
  revalidateCommunity(ctx.communityId);
}

/**
 * Discard an AI draft for this community. Mirrors app/admin/post-drafts/
 * actions.ts discardAction, which gates on the admin's *selected* community
 * (getAdminContext().currentCommunityId) rather than the portal context, so
 * the portal has its own copy scoped to ctx.communityId.
 */
export async function discardPortalDraftAction(formData: FormData): Promise<void> {
  const ctx = await assertPortalRole("communityPost");
  const draftId = String(formData.get("draft_id") ?? "").trim();
  if (!draftId) return;
  await createAdminClient()
    .from("artist_post_drafts")
    .update({
      status: "discarded",
      reviewed_by: ctx.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("artist_slug", ctx.communityId)
    .eq("status", "pending");
  revalidatePath("/artist-portal/community");
  revalidatePath("/admin/post-drafts");
}
