import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";
import { inboxDedupKey } from "../inbox-mirror";

/**
 * Someone commented on a post. Notify the post's author (unless they
 * commented on their own post — common when admins reply to themselves).
 *
 * Called fire-and-forget from `addCommentAction`.
 */
export async function notifyCommentOnMyPost(opts: {
  postId: string;
  commentId: string;
  commenterId: string;
  artistSlug: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: post } = await admin
      .from("community_posts")
      .select("author_id")
      .eq("id", opts.postId)
      .maybeSingle();
    if (!post) return;

    const authorId = post.author_id as string;
    if (!authorId || authorId === opts.commenterId) return;

    // Look up the commenter's first name for a personal title
    const { data: commenter } = await admin
      .from("fans")
      .select("first_name")
      .eq("id", opts.commenterId)
      .maybeSingle();
    const commenterName = (commenter?.first_name as string | undefined) ?? "Someone";

    // Excerpt of the comment
    const { data: comment } = await admin
      .from("community_comments")
      .select("body")
      .eq("id", opts.commentId)
      .maybeSingle();
    const excerpt = String(comment?.body ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    await sendNotification({
      fanId: authorId,
      type: "comment_on_my_post",
      payload: {
        title: `${commenterName} replied to your post`,
        body: excerpt || "Tap to read the comment.",
        url: `/artists/${opts.artistSlug}/community#post-${opts.postId}`,
        tag: `comment_on_my_post:${opts.postId}`,
      },
      inbox: {
        kind: "comment_on_my_post",
        dedupKey: inboxDedupKey("comment_on_my_post", opts.commentId),
        body: excerpt || "Open the post to read the comment.",
        communityId: opts.artistSlug,
      },
    });
  } catch (err) {
    console.warn("notifyCommentOnMyPost failed (non-blocking):", err);
  }
}
