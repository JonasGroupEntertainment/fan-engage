import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";

/**
 * Fan an artist follows just dropped a new post. Notify every follower
 * (excluding the author themselves, since they obviously know about it).
 *
 * Called fire-and-forget from `createPostAction`. We use `Promise.all`
 * with a hard cap of 200 concurrent sends — for any artist with a larger
 * follower base, this is a v2 issue (move to a queue/cron).
 *
 * The payload is intentionally minimal: artist name + first ~80 chars of
 * the post body. Click target is the artist's community feed.
 */
/**
 * Announcements are always the artist's voice; a plain `post` is only the
 * artist's when its author holds an admin_users grant for the community.
 */
export function isTeamAuthored(opts: { kind: string | null; hasTeamGrant: boolean }): boolean {
  if (opts.kind === "announcement") return true;
  return opts.hasTeamGrant;
}

/** "RaeLynn posted" for the artist/team; fan posts speak for the community. */
export function newPostTitle(artistName: string, fromTeam: boolean): string {
  return fromTeam ? `${artistName} posted` : `New in ${artistName}'s community`;
}

export async function notifyNewPost(opts: {
  postId: string;
  artistSlug: string;
  authorId: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    // Look up the artist's display name for the title
    const { data: artist } = await admin
      .from("artists")
      .select("name, slug")
      .eq("slug", opts.artistSlug)
      .maybeSingle();
    if (!artist) return;

    // Excerpt the post body
    const { data: post } = await admin
      .from("community_posts")
      .select("body, title, kind")
      .eq("id", opts.postId)
      .maybeSingle();
    if (!post) return;

    // Who wrote it? `admin_users.community_id` is the artist slug (or `*`
    // for super-admins), so a grant row for this community means the
    // author is the artist / their team. Fans have no row.
    const { data: grants } = await admin
      .from("admin_users")
      .select("community_id")
      .eq("user_id", opts.authorId)
      .in("community_id", [opts.artistSlug, "*"])
      .limit(1);
    const fromTeam = isTeamAuthored({
      kind: (post.kind as string | null) ?? null,
      hasTeamGrant: (grants ?? []).length > 0,
    });

    const excerpt = String(post.body ?? post.title ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    // Find followers who aren't the author
    const { data: follows } = await admin
      .from("fan_artist_following")
      .select("fan_id")
      .eq("artist_slug", opts.artistSlug);

    const fanIds = (follows ?? [])
      .map((r) => r.fan_id as string)
      .filter((id) => id !== opts.authorId);

    if (fanIds.length === 0) return;

    const title = newPostTitle(artist.name as string, fromTeam);
    const body = excerpt || "Check out the new post.";
    const url = `/artists/${opts.artistSlug}/community`;

    // Cap concurrency. 200 is a generous V1 limit — we'll move large
    // followings to a queued cron in V2.
    const MAX_CONCURRENT = 200;
    const targets = fanIds.slice(0, MAX_CONCURRENT);

    await Promise.all(
      targets.map((fanId) =>
        sendNotification({
          fanId,
          type: "new_post",
          payload: {
            title,
            body,
            url,
            tag: `new_post:${opts.postId}`,
          },
        }),
      ),
    );
  } catch (err) {
    console.warn("notifyNewPost failed (non-blocking):", err);
  }
}
