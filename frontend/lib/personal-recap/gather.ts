import { createAdminClient } from "@/lib/supabase/admin";
import type { WeeklyRecap } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const EMPTY_RECAP: WeeklyRecap = {
  windowStart: "",
  windowEnd: "",
  reactionsGiven: 0,
  commentsAdded: 0,
  rsvpsAdded: 0,
  pointsEarned: 0,
  topArtistSlug: null,
  topArtistName: null,
  currentStreakDays: 0,
  hasActivity: false,
};

/**
 * Compute the past-7-days recap for one fan. Uses admin client so we can
 * read across communities the fan follows without needing per-table RLS
 * carve-outs.
 *
 * Failure mode: any error returns EMPTY_RECAP with hasActivity=false.
 * Recap is non-essential UX — never block Fan Home from rendering.
 */
export async function gatherWeeklyRecap(fanId: string): Promise<WeeklyRecap> {
  if (!fanId) return EMPTY_RECAP;

  try {
    const admin = createAdminClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() - WEEK_MS);
    const windowStartIso = windowStart.toISOString();
    const windowEndIso = now.toISOString();

    // Fan row (for current_streak_days mirror)
    const fanPromise = admin
      .from("fans")
      .select("current_streak_days")
      .eq("id", fanId)
      .maybeSingle();

    // Reactions the fan placed
    const reactionsPromise = admin
      .from("community_reactions")
      .select("post_id, created_at", { count: "exact", head: false })
      .eq("fan_id", fanId)
      .gte("created_at", windowStartIso);

    // Comments the fan posted
    const commentsPromise = admin
      .from("community_comments")
      .select("id, post_id, created_at")
      .eq("author_id", fanId)
      .gte("created_at", windowStartIso);

    // RSVPs the fan added (still present in event_rsvps)
    const rsvpsPromise = admin
      .from("event_rsvps")
      .select("event_id, created_at")
      .eq("fan_id", fanId)
      .gte("created_at", windowStartIso);

    // Points earned this week (positive deltas only — refunds and
    // redemptions net out via the existing ledger semantics)
    const pointsPromise = admin
      .from("points_ledger")
      .select("delta, created_at")
      .eq("fan_id", fanId)
      .gte("created_at", windowStartIso);

    const [fanRes, reactionsRes, commentsRes, rsvpsRes, pointsRes] =
      await Promise.all([
        fanPromise,
        reactionsPromise,
        commentsPromise,
        rsvpsPromise,
        pointsPromise,
      ]);

    const reactionRows = reactionsRes.data ?? [];
    const commentRows = commentsRes.data ?? [];
    const rsvpRows = rsvpsRes.data ?? [];
    const pointRows = pointsRes.data ?? [];

    const reactionsGiven = reactionRows.length;
    const commentsAdded = commentRows.length;
    const rsvpsAdded = rsvpRows.length;
    const pointsEarned = pointRows.reduce((sum, r) => {
      const d = r.delta as number;
      return sum + (d > 0 ? d : 0);
    }, 0);

    const currentStreakDays =
      ((fanRes.data?.current_streak_days as number | undefined) ?? 0) || 0;

    const hasActivity =
      reactionsGiven + commentsAdded + rsvpsAdded + pointsEarned > 0 ||
      currentStreakDays > 0;

    if (!hasActivity) {
      return {
        ...EMPTY_RECAP,
        windowStart: windowStartIso,
        windowEnd: windowEndIso,
        currentStreakDays,
      };
    }

    // Top artist by activity volume.
    // Strategy: count artist_slug across (a) post-level reactions, (b)
    // post-level comments, and (c) artist_events.artist_slug for RSVPs.
    // We need to look up artist_slug for the post IDs the fan touched.
    const touchedPostIds = Array.from(
      new Set<string>([
        ...reactionRows.map((r) => r.post_id as string),
        ...commentRows.map((r) => r.post_id as string),
      ]),
    ).filter(Boolean);

    const touchedEventIds = Array.from(
      new Set<string>(rsvpRows.map((r) => r.event_id as string)),
    ).filter(Boolean);

    const slugCounts = new Map<string, number>();

    if (touchedPostIds.length > 0) {
      const { data: postRows } = await admin
        .from("community_posts")
        .select("id, artist_slug")
        .in("id", touchedPostIds);
      for (const p of postRows ?? []) {
        const slug = p.artist_slug as string;
        if (!slug) continue;
        slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
      }
    }
    if (touchedEventIds.length > 0) {
      const { data: eventRows } = await admin
        .from("artist_events")
        .select("id, artist_slug")
        .in("id", touchedEventIds);
      for (const e of eventRows ?? []) {
        const slug = e.artist_slug as string;
        if (!slug) continue;
        slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
      }
    }

    let topArtistSlug: string | null = null;
    let topCount = 0;
    for (const [slug, count] of slugCounts) {
      if (count > topCount) {
        topCount = count;
        topArtistSlug = slug;
      }
    }

    let topArtistName: string | null = null;
    if (topArtistSlug) {
      const { data: artist } = await admin
        .from("artists")
        .select("name")
        .eq("slug", topArtistSlug)
        .maybeSingle();
      topArtistName = (artist?.name as string | undefined) ?? topArtistSlug;
    }

    return {
      windowStart: windowStartIso,
      windowEnd: windowEndIso,
      reactionsGiven,
      commentsAdded,
      rsvpsAdded,
      pointsEarned,
      topArtistSlug,
      topArtistName,
      currentStreakDays,
      hasActivity: true,
    };
  } catch (err) {
    console.warn("gatherWeeklyRecap failed (non-blocking):", err);
    return EMPTY_RECAP;
  }
}
