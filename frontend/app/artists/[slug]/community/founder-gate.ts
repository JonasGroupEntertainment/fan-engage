import { createAdminClient } from "@/lib/supabase/admin";
import type { CommunityPost } from "@/lib/data/types";
import {
  mergeFounderStubs as mergeCore,
  stubToLockedPost,
  type FounderStub,
} from "@/lib/founder-gate/core";
import { scheduledPostsVisibleFilter, withScheduledFilterFallback } from "@/lib/data/scheduled-posts";

/**
 * Body-less stubs of founder-only posts the viewer could not read (0091 RLS).
 * Service-role read, selecting only id / title / kind / pinned / created_at —
 * never the body, image or video — so the locked card can say which post is
 * waiting without leaking it.
 */
export async function getLockedFounderPostStubs(
  artistSlug: string,
  opts: { excludeIds: readonly string[]; tagFilter?: string | null; limit?: number },
): Promise<CommunityPost[]> {
  try {
    const admin = createAdminClient();
    // Service-role read: a scheduled founder-only post must not leak its
    // title as a locked card before it is due (0094). Retried without the
    // filter until the column exists.
    const { data, error } = await withScheduledFilterFallback((withFilter) => {
      let q = admin
        .from("community_posts")
        .select("id, title, kind, pinned, created_at")
        .eq("artist_slug", artistSlug)
        .eq("visibility", "founder-only")
        .in("moderation_status", ["pending", "safe", "flag_review"]);
      if (withFilter) q = q.or(scheduledPostsVisibleFilter());
      q = q
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(opts.limit ?? 10);
      if (opts.tagFilter) q = q.contains("tags", [opts.tagFilter]);
      return q;
    });
    if (error || !data) return [];
    const exclude = new Set(opts.excludeIds);
    return (data as FounderStub[])
      .filter((s) => !exclude.has(s.id))
      .map((s) =>
        stubToLockedPost<CommunityPost>(s, {
          artist_slug: artistSlug,
          author_id: "",
          author_first_name: null,
          video_url: null,
          video_poster_url: null,
          image_url: null,
          image_alt: null,
          moderation_status: null,
          moderation_user_message: null,
          reaction_counts: {},
          my_reactions: [],
          comment_count: 0,
          thread_summary: null,
          thread_summary_count: null,
          tags: [],
        }),
      );
  } catch {
    return [];
  }
}

export function mergeFounderStubs(
  visible: readonly CommunityPost[],
  stubs: readonly CommunityPost[],
): CommunityPost[] {
  return mergeCore(visible, stubs);
}
