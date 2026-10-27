/**
 * Per-fan payload assembly for the weekly digest.
 *
 * Given a fan, walks their followed artists and builds a DigestPayload:
 *   * For each followed artist (up to MAX_COMMUNITIES_PER_DIGEST):
 *     - Top 1-2 posts from the last 7 days, ranked by reaction count
 *       (computed inline from community_reactions — there's no
 *       stored count column on community_posts)
 *     - Up to 2 upcoming events the fan hasn't RSVPed to yet
 *   * One reward suggestion the fan can afford right now (point_cost
 *     <= total_points, optionally tier-gated)
 *
 * Vibe summaries are NOT generated here — that's a separate batched
 * Claude call in summarize.ts. Keeping IO-heavy DB work and AI work in
 * separate stages lets the cron parallelize/batch each appropriately.
 *
 * Uses createAdminClient (service_role) so we can read across
 * communities without RLS — the digest content is server-only and
 * never exposed to other fans.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DigestCommunityBlock,
  DigestEvent,
  DigestPostHighlight,
  DigestPayload,
  DigestRecipient,
  DigestRewardSuggestion,
} from "./types";

export type DigestGatherResult =
  | { ok: true; payload: DigestPayload }
  | { ok: false; reason: string };

/** fan_artist_following stores followed_at, not created_at. */
const FOLLOW_ORDER_COLUMN = "followed_at";

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";

/** Cap how many communities show up in a single digest. */
const MAX_COMMUNITIES_PER_DIGEST = 3;

/** Pull this many post candidates per community before ranking. */
const POSTS_CANDIDATES_PER_COMMUNITY = 8;

/** How many top posts make the digest per community. */
const POSTS_PER_COMMUNITY = 2;

/** How many upcoming events to pull per community. */
const EVENTS_PER_COMMUNITY = 2;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build the full DigestPayload for one fan.
 *
 * Query failures throw (the caller records them as a per-fan error).
 * A fan who follows nobody, or whose followed communities have nothing
 * new, returns ok:false with a reason — that is a skip, not an error.
 */
export async function gatherDigestPayload(
  recipient: DigestRecipient,
): Promise<DigestGatherResult> {
  const admin = createAdminClient();

  // 1. Followed communities. Most recently followed first.
  const follows = rowsOrThrow(
    "fan_artist_following",
    await admin
      .from("fan_artist_following")
      .select("artist_slug, followed_at")
      .eq("fan_id", recipient.fan_id)
      .order(FOLLOW_ORDER_COLUMN, { ascending: false }),
  );
  const followedSlugs = follows.map((r) => r.artist_slug as string);
  if (followedSlugs.length === 0) {
    return { ok: false, reason: "Fan follows no artists" };
  }

  // Cap to MAX_COMMUNITIES_PER_DIGEST. Most-recently-followed first
  // (proxy for active interest). Easy to swap for engagement-ranked later.
  const targetSlugs = followedSlugs.slice(0, MAX_COMMUNITIES_PER_DIGEST);

  // 2. Pull community metadata for display names.
  const communityRows = rowsOrThrow(
    "communities",
    await admin
      .from("communities")
      .select("slug, display_name")
      .in("slug", targetSlugs),
  );
  const displayNameBySlug = new Map<string, string>();
  for (const c of communityRows ?? []) {
    displayNameBySlug.set(c.slug as string, c.display_name as string);
  }

  // 3. Pull post candidates from the last 7 days, filtered by moderation status
  //    (anything not auto_hide is fine — pending rows might still be in
  //    classification but their content is real).
  const oneWeekAgoIso = new Date(Date.now() - WEEK_MS).toISOString();
  const postRows = rowsOrThrow(
    "community_posts",
    await admin
      .from("community_posts")
      .select("id, artist_slug, title, body, created_at, moderation_status")
      .in("artist_slug", targetSlugs)
      .gte("created_at", oneWeekAgoIso)
      .in("moderation_status", ["pending", "safe", "flag_review"])
      .order("created_at", { ascending: false })
      .limit(targetSlugs.length * POSTS_CANDIDATES_PER_COMMUNITY),
  );

  // 4. Pull reaction + comment counts for those posts in two batched queries.
  const candidatePostIds = (postRows ?? []).map((p) => p.id as string);
  const reactionsByPost = new Map<string, number>();
  const commentsByPost = new Map<string, number>();

  if (candidatePostIds.length > 0) {
    const [reactionResult, commentResult] = await Promise.all([
      admin
        .from("community_reactions")
        .select("post_id")
        .in("post_id", candidatePostIds),
      admin
        .from("community_comments")
        .select("post_id, moderation_status")
        .in("post_id", candidatePostIds),
    ]);
    const reactionRows = rowsOrThrow("community_reactions", reactionResult);
    const commentRows = rowsOrThrow("community_comments", commentResult);

    for (const r of reactionRows ?? []) {
      const id = r.post_id as string;
      reactionsByPost.set(id, (reactionsByPost.get(id) ?? 0) + 1);
    }
    for (const c of commentRows ?? []) {
      // Don't count auto_hide comments toward the headline number.
      if (c.moderation_status === "auto_hide") continue;
      const id = c.post_id as string;
      commentsByPost.set(id, (commentsByPost.get(id) ?? 0) + 1);
    }
  }

  // 5. Bucket posts by community, attach counts.
  const postsByCommunity = new Map<string, DigestPostHighlight[]>();
  for (const p of postRows ?? []) {
    const slug = p.artist_slug as string;
    const id = p.id as string;
    const arr = postsByCommunity.get(slug) ?? [];
    arr.push({
      id,
      artist_slug: slug,
      title: (p.title as string | null) ?? null,
      body: p.body as string,
      reaction_count: reactionsByPost.get(id) ?? 0,
      comment_count: commentsByPost.get(id) ?? 0,
      created_at: p.created_at as string,
      url: `${APP_BASE_URL}/artists/${slug}/community#post-${id}`,
    });
    postsByCommunity.set(slug, arr);
  }

  // 6. Upcoming events per community, filtered to those the fan hasn't RSVPed to.
  const rsvpRows = rowsOrThrow(
    "event_rsvps",
    await admin
      .from("event_rsvps")
      .select("event_id")
      .eq("fan_id", recipient.fan_id),
  );
  const rsvpedIds = new Set<string>(
    (rsvpRows ?? []).map((r) => r.event_id as string),
  );

  const eventRows = rowsOrThrow(
    "artist_events",
    await admin
      .from("artist_events")
      .select("id, artist_slug, title, detail, event_date, url, sort_order, active")
      .in("artist_slug", targetSlugs)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
  );

  const eventsByCommunity = new Map<string, DigestEvent[]>();
  for (const e of eventRows ?? []) {
    if (rsvpedIds.has(e.id as string)) continue;
    const slug = e.artist_slug as string;
    const arr = eventsByCommunity.get(slug) ?? [];
    if (arr.length >= EVENTS_PER_COMMUNITY) continue;
    arr.push({
      id: e.id as string,
      artist_slug: slug,
      title: e.title as string,
      detail: (e.detail as string | null) ?? null,
      event_date: (e.event_date as string | null) ?? null,
      url:
        (e.url as string | null) ??
        `${APP_BASE_URL}/artists/${slug}#event-${e.id}`,
    });
    eventsByCommunity.set(slug, arr);
  }

  // 7. Assemble per-community blocks. Rank top posts within each community
  //    by reaction_count desc, then comment_count desc, then created_at desc.
  const communities: DigestCommunityBlock[] = targetSlugs
    .map((slug) => {
      const posts = (postsByCommunity.get(slug) ?? [])
        .sort((a, b) => {
          if (b.reaction_count !== a.reaction_count) {
            return b.reaction_count - a.reaction_count;
          }
          if (b.comment_count !== a.comment_count) {
            return b.comment_count - a.comment_count;
          }
          return b.created_at.localeCompare(a.created_at);
        })
        .slice(0, POSTS_PER_COMMUNITY);
      return {
        community_id: slug,
        display_name: displayNameBySlug.get(slug) ?? slug,
        topPosts: posts,
        upcomingEvents: eventsByCommunity.get(slug) ?? [],
      };
    })
    // Drop communities with neither posts nor upcoming events — empty
    // sections in the email are noise.
    .filter((b) => b.topPosts.length > 0 || b.upcomingEvents.length > 0);

  if (communities.length === 0) {
    return {
      ok: false,
      reason:
        "No posts from the last 7 days and no upcoming events in followed communities",
    };
  }

  // 8. Reward suggestion — most-aspirational reward they can afford right now.
  const rewardSuggestion = await suggestReward(recipient, targetSlugs);

  return {
    ok: true,
    payload: {
      recipient,
      week_start: monday00UTC(new Date()).toISOString().slice(0, 10),
      communities,
      rewardSuggestion,
    },
  };
}

function rowsOrThrow<T>(
  label: string,
  result: { data: T[] | null; error: { message: string } | null },
): T[] {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data ?? [];
}

/** Pick the most-aspirational redeemable reward in the fan's followed
 *  communities. Returns null if nothing eligible. */
async function suggestReward(
  recipient: DigestRecipient,
  communitySlugs: string[],
): Promise<DigestRewardSuggestion | null> {
  if (communitySlugs.length === 0) return null;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("rewards_catalog")
    .select(
      "id, community_id, title, description, point_cost, requires_tier, active",
    )
    .in("community_id", communitySlugs)
    .eq("active", true)
    .lte("point_cost", recipient.total_points)
    .order("point_cost", { ascending: false }) // most expensive thing they can still afford
    .limit(20);
  if (error) throw new Error(`rewards_catalog: ${error.message}`);

  // Filter out tier-gated rewards the fan can't access. V1 conservatively
  // skips premium / founder rewards (we'd need a join to fan_community_memberships
  // to check subscription_tier, deferring that to V2).
  const eligible = (data ?? []).filter((r) => {
    const required = r.requires_tier as string | null;
    return !required;
  });

  if (eligible.length === 0) return null;
  const top = eligible[0] as Record<string, unknown>;
  return {
    id: String(top.id),
    community_id: String(top.community_id),
    title: String(top.title),
    description: (top.description as string | null) ?? null,
    point_cost: Number(top.point_cost),
    url: `${APP_BASE_URL}/artists/${top.community_id}/rewards#${top.id}`,
  };
}

/** Round a date down to the most recent Monday at 00:00 UTC. */
function monday00UTC(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  const dow = out.getUTCDay(); // 0=Sun
  const daysSinceMonday = (dow + 6) % 7;
  out.setUTCDate(out.getUTCDate() - daysSinceMonday);
  return out;
}
