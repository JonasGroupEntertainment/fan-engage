import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CommunityPost } from "@/lib/data/types";
import {
  mergeFounderStubs as mergeCore,
  stubToLockedPost,
  type FounderStub,
  type PostVisibility,
} from "@/lib/founder-gate/core";
import { scheduledPostsVisibleFilter, withScheduledFilterFallback } from "@/lib/data/scheduled-posts";

/**
 * Title-only stubs of premium and founder-only posts the viewer cannot
 * read. Prefers locked_community_post_stubs (0096), which cannot return
 * a body. Until that function exists, a service-role read selects the
 * same columns and never body, image, or video.
 */
export async function getLockedPostStubs(
  artistSlug: string,
  opts: { excludeIds: readonly string[]; tagFilter?: string | null; limit?: number },
): Promise<CommunityPost[]> {
  try {
    const limit = opts.limit ?? 10;
    const fromRpc = await stubsFromRpc(artistSlug, opts.tagFilter ?? null, limit);
    const rows = fromRpc ?? (await stubsFromAdmin(artistSlug, opts.tagFilter ?? null, limit));
    const exclude = new Set(opts.excludeIds);
    return rows
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

/** @deprecated Use getLockedPostStubs. Kept so older imports still compile. */
export const getLockedFounderPostStubs = getLockedPostStubs;

async function stubsFromRpc(
  artistSlug: string,
  tagFilter: string | null,
  limit: number,
): Promise<FounderStub[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("locked_community_post_stubs", {
    p_artist_slug: artistSlug,
    p_tag: tagFilter,
    p_limit: limit,
  });
  if (error) return null;
  return (data ?? []).map(asStub);
}

async function stubsFromAdmin(
  artistSlug: string,
  tagFilter: string | null,
  limit: number,
): Promise<FounderStub[]> {
  const admin = createAdminClient();
  const { data, error } = await withScheduledFilterFallback((withFilter) => {
    let q = admin
      .from("community_posts")
      .select("id, title, kind, pinned, created_at, visibility")
      .eq("artist_slug", artistSlug)
      .in("visibility", ["premium", "founder-only"])
      .in("moderation_status", ["pending", "safe", "flag_review"]);
    if (withFilter) q = q.or(scheduledPostsVisibleFilter());
    q = q.order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
    if (tagFilter) q = q.contains("tags", [tagFilter]);
    return q;
  });
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map(asStub);
}

function asStub(row: Record<string, unknown>): FounderStub {
  const visibility = row.visibility === "premium" || row.visibility === "founder-only"
    ? (row.visibility as PostVisibility)
    : "founder-only";
  return {
    id: String(row.id),
    title: (row.title as string | null) ?? null,
    kind: String(row.kind ?? "post"),
    pinned: Boolean(row.pinned),
    created_at: String(row.created_at ?? ""),
    visibility,
  };
}

export function mergeFounderStubs(
  visible: readonly CommunityPost[],
  stubs: readonly CommunityPost[],
): CommunityPost[] {
  return mergeCore(visible, stubs);
}
