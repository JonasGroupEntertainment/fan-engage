/**
 * Server-side helper that gathers everything the comment drafter needs
 * and calls the classifier.
 *
 * The post body is read with the fan's session (RLS). A second check
 * against the tier matrix refuses the draft when the fan cannot read
 * the post, so a free fan never sends a premium or founder-only body
 * to the model. Community tagline and the fan's own older comments
 * still use the service role — those are not the gated post.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin";
import { getEntitlement } from "@/lib/entitlements";
import { canReadPost, type PostVisibility, type PostViewer } from "@/lib/founder-gate/core";
import { generateCommentDrafts, DraftError } from "./client";

export interface DraftCommentRequest {
  postId: string;
  /** auth.uid() of the requester. */
  userId: string;
}

export type DraftCommentResult =
  | { ok: true; drafts: string[] }
  | { ok: false; error: string };

const LOCKED = "That post is locked.";

interface ReadablePost {
  id: string;
  artist_slug: string;
  kind: string;
  title: string | null;
  body: string;
}

/** Session read plus the tier check. Null when the body must not be used. */
async function loadReadablePost(
  postId: string,
  userId: string,
): Promise<ReadablePost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_posts")
    .select("id, artist_slug, author_id, kind, title, body, visibility")
    .eq("id", postId)
    .maybeSingle();
  if (error || !data) return null;

  const artistSlug = data.artist_slug as string;
  const [entitlement, adminCtx] = await Promise.all([
    getEntitlement(userId, artistSlug).catch(() => null),
    getAdminContext().catch(() => null),
  ]);
  const viewer: PostViewer = {
    isAdmin: Boolean(
      adminCtx && (adminCtx.isSuperAdmin || adminCtx.communities.includes(artistSlug)),
    ),
    isFounder: Boolean(entitlement?.isFounder),
    isPremium: Boolean(entitlement?.isPremium),
    fanId: userId,
  };
  const visibility = (data.visibility as PostVisibility | null) ?? "public";
  if (
    !canReadPost(
      { visibility, author_id: data.author_id as string | null },
      viewer,
    )
  ) {
    return null;
  }
  return {
    id: data.id as string,
    artist_slug: artistSlug,
    kind: (data.kind as string) ?? "post",
    title: (data.title as string | null) ?? null,
    body: (data.body as string) ?? "",
  };
}

/** Generate 3 reply drafts for the given (post, user) pair. */
export async function draftComment(
  req: DraftCommentRequest,
): Promise<DraftCommentResult> {
  if (!req.postId || !req.userId) {
    return { ok: false, error: "Missing postId or userId." };
  }

  try {
    const post = await loadReadablePost(req.postId, req.userId);
    if (!post) return { ok: false, error: LOCKED };

    const admin = createAdminClient();
    const [{ data: community }, { data: artist }, { data: priorComments }] = await Promise.all([
      admin
        .from("communities")
        .select("display_name, tagline")
        .eq("slug", post.artist_slug)
        .maybeSingle(),
      admin.from("artists").select("genres").eq("slug", post.artist_slug).maybeSingle(),
      admin
        .from("community_comments")
        .select("body")
        .eq("author_id", req.userId)
        .neq("post_id", req.postId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const drafts = await generateCommentDrafts({
      postBody: post.body,
      postTitle: post.title,
      postKind: post.kind,
      communityName: (community?.display_name as string | undefined) ?? undefined,
      communityTagline: (community?.tagline as string | null) ?? null,
      communityGenres: (artist?.genres as string[] | null) ?? undefined,
      userPriorComments: (priorComments ?? [])
        .map((r) => String(r.body ?? "").trim())
        .filter((s) => s.length > 0),
    });

    return { ok: true, drafts };
  } catch (err) {
    const message =
      err instanceof DraftError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[drafts] draftComment failed:", message);
    return { ok: false, error: message };
  }
}
