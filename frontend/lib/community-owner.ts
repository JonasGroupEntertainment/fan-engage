import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Looks up which artist community owns a community post, comment or
 * challenge entry, so admin by-id writes can be checked against the row
 * in the database instead of anything the client sent.
 * Returns null when the row does not exist.
 */
export type CommunityRowTable =
  | "community_posts"
  | "community_comments"
  | "community_challenge_entries";

export async function communityOfRow(
  table: CommunityRowTable,
  id: string,
): Promise<string | null> {
  const supa = createAdminClient();
  let postId = id;
  if (table !== "community_posts") {
    const { data: child } = await supa.from(table).select("post_id").eq("id", id).maybeSingle();
    if (!child?.post_id) return null;
    postId = child.post_id as string;
  }
  const { data: post } = await supa
    .from("community_posts")
    .select("artist_slug")
    .eq("id", postId)
    .maybeSingle();
  return (post?.artist_slug as string | undefined) ?? null;
}
