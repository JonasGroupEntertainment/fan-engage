import { createClient } from "@/lib/supabase/server";
import type {
  ChallengeEntry,
  CommunityComment,
  CommunityPost,
  PollData,
  PollOption,
} from "./types";

/**
 * Fetches the community feed for one artist, newest first with pinned
 * posts always at the top. Aggregates reactions + comment counts so the
 * UI renders in a single round-trip.
 */
export async function getPostsByArtist(
  artistSlug: string,
  limit = 30,
  options: { tagFilter?: string | null } = {},
): Promise<CommunityPost[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let postsQuery = supabase
      .from("community_posts")
      .select(
        "id, artist_slug, author_id, kind, title, body, image_url, video_url, video_poster_url, pinned, visibility, created_at, tags, thread_summary, thread_summary_count",
      )
      .eq("artist_slug", artistSlug)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    // Phase 5 #5: optional ?tag=foo filter from the community-feed URL.
    // Uses pgvector-style array contains via Supabase's .contains().
    if (options.tagFilter && options.tagFilter.length > 0) {
      postsQuery = postsQuery.contains("tags", [options.tagFilter]);
    }

    const { data: posts, error: postsErr } = await postsQuery;

    if (postsErr) throw postsErr;
    if (!posts || posts.length === 0) return [];

    const postIds = posts.map((p) => p.id as string);
    const authorIds = [...new Set(posts.map((p) => p.author_id as string))];

    const [authorsRes, reactionsRes, myReactionsRes, commentCountRes] = await Promise.all([
      // RPC, not a direct fans select — RLS only exposes the viewer's own
      // fans row, which made every other author render as "Anonymous fan".
      supabase.rpc("get_fan_display_names", { p_ids: authorIds }) as unknown as Promise<{ data: { id: string; first_name: string | null }[] | null }>,
      supabase
        .from("community_reactions")
        .select("post_id, emoji")
        .in("post_id", postIds),
      user
        ? supabase
            .from("community_reactions")
            .select("post_id, emoji")
            .in("post_id", postIds)
            .eq("fan_id", user.id)
        : Promise.resolve({ data: [] as { post_id: string; emoji: string }[], error: null }),
      supabase
        .from("community_comments")
        .select("post_id")
        .in("post_id", postIds),
    ]);

    const authorNameById = new Map<string, string | null>(
      (authorsRes.data ?? []).map((a) => [a.id as string, (a.first_name as string | null) ?? null]),
    );

    const reactionsByPost = new Map<string, Record<string, number>>();
    for (const r of reactionsRes.data ?? []) {
      const pid = r.post_id as string;
      const e = r.emoji as string;
      const bucket = reactionsByPost.get(pid) ?? {};
      bucket[e] = (bucket[e] ?? 0) + 1;
      reactionsByPost.set(pid, bucket);
    }

    const myReactionsByPost = new Map<string, string[]>();
    for (const r of myReactionsRes.data ?? []) {
      const pid = r.post_id as string;
      const arr = myReactionsByPost.get(pid) ?? [];
      arr.push(r.emoji as string);
      myReactionsByPost.set(pid, arr);
    }

    const commentCountsByPost = new Map<string, number>();
    for (const c of commentCountRes.data ?? []) {
      const pid = c.post_id as string;
      commentCountsByPost.set(pid, (commentCountsByPost.get(pid) ?? 0) + 1);
    }

    return posts.map(
      (p) =>
        ({
          id: p.id as string,
          artist_slug: p.artist_slug as string,
          author_id: p.author_id as string,
          author_first_name: authorNameById.get(p.author_id as string) ?? null,
          kind: p.kind,
          title: p.title as string | null,
          body: p.body as string,
          image_url: p.image_url as string | null,
          video_url: p.video_url as string | null,
          video_poster_url: p.video_poster_url as string | null,
          pinned: p.pinned as boolean,
          visibility:
            ((p.visibility as "public" | "premium" | null) ?? "public"),
          created_at: p.created_at as string,
          reaction_counts: reactionsByPost.get(p.id as string) ?? {},
          my_reactions: myReactionsByPost.get(p.id as string) ?? [],
          comment_count: commentCountsByPost.get(p.id as string) ?? 0,
          thread_summary: ((p as { thread_summary?: string | null }).thread_summary) ?? null,
          thread_summary_count: ((p as { thread_summary_count?: number | null }).thread_summary_count) ?? null,
      tags: ((p as { tags?: string[] }).tags as string[] | undefined) ?? [],
        }) as CommunityPost,
    );
  } catch {
    return [];
  }
}

/**
 * Fetch the poll data for a single poll post: options + vote counts + whether
 * the current fan has already voted (and which option they picked).
 */
export async function getPollData(postId: string): Promise<PollData | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [optionsRes, votesRes, myVoteRes] = await Promise.all([
      supabase
        .from("community_poll_options")
        .select("id, post_id, label, sort_order")
        .eq("post_id", postId)
        .order("sort_order"),
      supabase
        .from("community_poll_votes")
        .select("option_id")
        .eq("post_id", postId),
      user
        ? supabase
            .from("community_poll_votes")
            .select("option_id")
            .eq("post_id", postId)
            .eq("fan_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (optionsRes.error) throw optionsRes.error;
    const options = optionsRes.data ?? [];
    if (options.length === 0) return null;

    const voteCounts = new Map<string, number>();
    for (const v of votesRes.data ?? []) {
      const oid = v.option_id as string;
      voteCounts.set(oid, (voteCounts.get(oid) ?? 0) + 1);
    }

    return {
      options: options.map(
        (o) =>
          ({
            id: o.id as string,
            post_id: o.post_id as string,
            label: o.label as string,
            sort_order: o.sort_order as number,
            vote_count: voteCounts.get(o.id as string) ?? 0,
          }) as PollOption,
      ),
      total_votes: [...voteCounts.values()].reduce((a, b) => a + b, 0),
      my_option_id: (myVoteRes.data?.option_id as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

/** Challenge entries for a single challenge post, newest first. */
export async function getChallengeEntries(
  postId: string,
): Promise<ChallengeEntry[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("community_challenge_entries")
      .select("id, post_id, fan_id, body, image_url, image_alt, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) return [];

    const fanIds = [...new Set(data.map((e) => e.fan_id as string))];
    const { data: fans } = (await supabase.rpc("get_fan_display_names", {
      p_ids: fanIds,
    })) as { data: { id: string; first_name: string | null }[] | null };
    const nameById = new Map<string, string | null>(
      (fans ?? []).map((f) => [f.id as string, (f.first_name as string | null) ?? null]),
    );

    return data.map(
      (e) =>
        ({
          id: e.id as string,
          post_id: e.post_id as string,
          fan_id: e.fan_id as string,
          fan_first_name: nameById.get(e.fan_id as string) ?? null,
          body: e.body as string | null,
          image_url: e.image_url as string | null,
          created_at: e.created_at as string,
        }) as ChallengeEntry,
    );
  } catch {
    return [];
  }
}

/** All comments on a single post, ascending by time. */
export async function getCommentsByPost(
  postId: string,
): Promise<CommunityComment[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("community_comments")
      .select("id, post_id, author_id, body, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return [];

    const authorIds = [...new Set(data.map((c) => c.author_id as string))];
    const { data: authors } = (await supabase.rpc("get_fan_display_names", {
      p_ids: authorIds,
    })) as { data: { id: string; first_name: string | null }[] | null };
    const nameById = new Map<string, string | null>(
      (authors ?? []).map((a) => [a.id as string, (a.first_name as string | null) ?? null]),
    );

    return data.map(
      (c) =>
        ({
          id: c.id as string,
          post_id: c.post_id as string,
          author_id: c.author_id as string,
          author_first_name: nameById.get(c.author_id as string) ?? null,
          body: c.body as string,
          created_at: c.created_at as string,
        }) as CommunityComment,
    );
  } catch {
    return [];
  }
}


/**
 * Returns the top-N most-frequently-used tags in an artist's community,
 * with post counts. Powers the filter chips on /artists/[slug]/community.
 *
 * Calls the list_top_tags_for_community Postgres function (defined in
 * migration 0028) so the heavy lifting (unnest + group by + count) stays
 * in the DB.
 */
export async function getTopTagsForArtist(
  artistSlug: string,
  limit = 12,
): Promise<Array<{ tag: string; post_count: number }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_top_tags_for_community", {
      p_artist_slug: artistSlug,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as Array<{ tag: string; post_count: number | string }>).map((r) => ({
      tag: String(r.tag),
      post_count: Number(r.post_count),
    }));
  } catch (err) {
    console.warn("getTopTagsForArtist failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
