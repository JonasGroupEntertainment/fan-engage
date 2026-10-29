import { createAdminClient } from "@/lib/supabase/admin";
import { fanDisplayName } from "@/lib/format/fan-name";
import type {
  ArtistMonthlyLeaderboard,
  LeaderboardEntry,
} from "./types";

import {
  aggregateScores,
  rankScores,
  SCORE_WEIGHTS,
  type ActivityEvent,
} from "./score";

export { SCORE_WEIGHTS, aggregateScores } from "./score";

/** Get the first day (UTC midnight) of the month containing `at`. */
function startOfMonthUtc(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

function formatMonthLabel(monthStart: Date): string {
  return monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Compute the per-artist monthly leaderboard. Returns top N + the viewer's
 * own rank if they have any activity this month.
 *
 * Implementation: parallel row reads (reactions, comments, posts, RSVPs,
 * check-ins, shares) scoped to the month and artist, folded in TS by the
 * pure `aggregateScores` into a per-fan score map. Then sort, slice, and
 * resolve display names + avatars in a single batch read on `fans`.
 * Weights live in `./score.ts` (SCORE_WEIGHTS).
 *
 * Failure mode: any error returns a benign empty leaderboard so the
 * page can render a "Be the first to top the chart" empty state.
 */
export async function gatherArtistLeaderboard(opts: {
  artistSlug: string;
  viewerFanId?: string | null;
  topN?: number;
  monthStart?: Date; // defaults to current calendar month UTC
}): Promise<ArtistMonthlyLeaderboard | null> {
  const topN = opts.topN ?? 10;
  const monthStart = startOfMonthUtc(opts.monthStart ?? new Date());
  const nextMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  const monthStartIso = monthStart.toISOString();
  const nextMonthIso = nextMonth.toISOString();

  const empty: ArtistMonthlyLeaderboard = {
    monthStart: monthStartIso,
    monthLabel: formatMonthLabel(monthStart),
    artistSlug: opts.artistSlug,
    artistName: opts.artistSlug,
    top: [],
    viewerEntry: null,
    totalFans: 0,
  };

  try {
    const admin = createAdminClient();

    // Resolve artist display name (best-effort; falls back to slug).
    const artistPromise = admin
      .from("artists")
      .select("name, slug")
      .eq("slug", opts.artistSlug)
      .maybeSingle();

    // Step 1: collect post IDs that belong to this artist's community.
    // We need this to scope reactions + comments — the reaction/comment
    // tables don't carry artist_slug directly.
    const postsPromise = admin
      .from("community_posts")
      .select("id")
      .eq("artist_slug", opts.artistSlug);

    // Step 2: artist-scoped event IDs for RSVP scoping.
    const eventsPromise = admin
      .from("artist_events")
      .select("id")
      .eq("artist_slug", opts.artistSlug);

    const [artistRes, postsRes, eventsRes] = await Promise.all([
      artistPromise,
      postsPromise,
      eventsPromise,
    ]);

    const artistName =
      (artistRes.data?.name as string | undefined) ?? opts.artistSlug;
    const postIds = (postsRes.data ?? []).map((p) => p.id as string);
    const eventIds = (eventsRes.data ?? []).map((e) => e.id as string);

    // Step 3: pull this month's activity rows scoped to those post/event IDs.
    // If the artist has no posts at all, reactions/comments come back empty
    // and we skip the IN-clause (Supabase rejects an empty `in()`).
    const reactionsPromise =
      postIds.length > 0
        ? admin
            .from("community_reactions")
            .select("fan_id")
            .in("post_id", postIds)
            .gte("created_at", monthStartIso)
            .lt("created_at", nextMonthIso)
        : Promise.resolve({ data: [] as Array<{ fan_id: string }> });

    const commentsPromise =
      postIds.length > 0
        ? admin
            .from("community_comments")
            .select("author_id")
            .in("post_id", postIds)
            .gte("created_at", monthStartIso)
            .lt("created_at", nextMonthIso)
        : Promise.resolve({ data: [] as Array<{ author_id: string }> });

    const rsvpsPromise =
      eventIds.length > 0
        ? admin
            .from("event_rsvps")
            .select("fan_id")
            .in("event_id", eventIds)
            // event_rsvps stamps `rsvp_at` (0007) — there is no created_at.
            .gte("rsvp_at", monthStartIso)
            .lt("rsvp_at", nextMonthIso)
        : Promise.resolve({ data: [] as Array<{ fan_id: string }> });

    // Posts started by fans this month. Admin-only kinds (announcement,
    // poll, challenge, prediction) are excluded by `kind = post`; there is no
    // author-role column on the row, so team members posting a plain post
    // still count unless they are flagged fans.is_internal (dropped below).
    const postsThisMonthPromise = admin
      .from("community_posts")
      .select("author_id")
      .eq("artist_slug", opts.artistSlug)
      .eq("kind", "post")
      .gte("created_at", monthStartIso)
      .lt("created_at", nextMonthIso);

    // In-person check-ins (public.checkins, 20260620195039).
    const checkinsPromise = admin
      .from("checkins")
      .select("fan_id")
      .eq("artist_slug", opts.artistSlug)
      .gte("created_at", monthStartIso)
      .lt("created_at", nextMonthIso);

    // Shares have no table of their own: the durable record is the
    // points_ledger row try_award_share_points (0053) writes with
    // source = 'social_share' and community_id = artist slug. The SQL cap
    // (3/day) therefore also caps what the board can see — acceptable.
    const sharesPromise = admin
      .from("points_ledger")
      .select("fan_id")
      .eq("community_id", opts.artistSlug)
      .eq("source", "social_share")
      .gt("delta", 0)
      .gte("created_at", monthStartIso)
      .lt("created_at", nextMonthIso);

    // Redemptions are intentionally NOT fetched: SCORE_WEIGHTS.redemption is
    // 0, so spending points neither raises nor lowers a fan's rank.

    const [
      reactionsRes,
      commentsRes,
      rsvpsRes,
      postsThisMonthRes,
      checkinsRes,
      sharesRes,
    ] = await Promise.all([
      reactionsPromise,
      commentsPromise,
      rsvpsPromise,
      postsThisMonthPromise,
      checkinsPromise,
      sharesPromise,
    ]);

    const events: ActivityEvent[] = [];
    for (const r of reactionsRes.data ?? [])
      events.push({ fanId: r.fan_id as string, kind: "reaction" });
    for (const c of commentsRes.data ?? [])
      events.push({ fanId: c.author_id as string, kind: "comment" });
    for (const r of rsvpsRes.data ?? [])
      events.push({ fanId: r.fan_id as string, kind: "rsvp" });
    for (const p of postsThisMonthRes.data ?? [])
      events.push({ fanId: p.author_id as string, kind: "post" });
    for (const c of checkinsRes.data ?? [])
      events.push({ fanId: c.fan_id as string, kind: "checkin" });
    for (const s of sharesRes.data ?? [])
      events.push({ fanId: s.fan_id as string, kind: "share" });

    const scores = aggregateScores(events, SCORE_WEIGHTS);

    if (scores.size === 0) {
      return { ...empty, artistName };
    }

    // Sort by score desc; tie-break by fan_id for stability.
    const sorted = rankScores(scores);

    // Resolve display names + avatars + tier in a single batch. Internal /
    // test accounts (fans.is_internal, 0073) never chart: they are dropped
    // here, before ranks are assigned, so public fans keep real positions.
    const candidateIds = sorted.map(([fanId]) => fanId);
    const { data: fanRows } = await admin
      .from("fans")
      .select("id, first_name, last_name, avatar_url, current_tier, profile_slug, public_profile_enabled, is_internal")
      .in("id", candidateIds)
      .eq("is_internal", false);
    const publicIds = new Set((fanRows ?? []).map((f) => f.id as string));
    for (const id of candidateIds) if (!publicIds.has(id)) scores.delete(id);
    const ranked = sorted.filter(([fanId]) => publicIds.has(fanId));
    if (ranked.length === 0) {
      return { ...empty, artistName };
    }
    const fanInfoById = new Map<
      string,
      {
        display_name: string;
        avatar_url: string | null;
        current_tier: string | null;
        profile_slug: string | null;
      }
    >();
    for (const f of fanRows ?? []) {
      const display = fanDisplayName(
        f as { first_name: string | null; last_name: string | null },
      );
      const publicProfileEnabled = (f.public_profile_enabled as boolean | null) ?? false;
      fanInfoById.set(f.id as string, {
        display_name: display,
        avatar_url: (f.avatar_url as string | null) ?? null,
        current_tier: (f.current_tier as string | null) ?? null,
        profile_slug: publicProfileEnabled ? ((f.profile_slug as string | null) ?? null) : null,
      });
    }

    function buildEntry(rank: number, fanId: string): LeaderboardEntry {
      const s = scores.get(fanId)!;
      const info = fanInfoById.get(fanId);
      return {
        fan_id: fanId,
        rank,
        display_name: info?.display_name ?? "A fan",
        avatar_url: info?.avatar_url ?? null,
        current_tier: info?.current_tier ?? null,
        profile_slug: info?.profile_slug ?? null,
        score: s.score,
        reactions: s.counts.reaction,
        comments: s.counts.comment,
        posts: s.counts.post,
        shares: s.counts.share,
        rsvps: s.counts.rsvp,
        checkins: s.counts.checkin,
      };
    }

    const top: LeaderboardEntry[] = ranked
      .slice(0, topN)
      .map(([fanId], idx) => buildEntry(idx + 1, fanId));

    let viewerEntry: LeaderboardEntry | null = null;
    if (opts.viewerFanId) {
      const viewerIdx = ranked.findIndex(([id]) => id === opts.viewerFanId);
      if (viewerIdx !== -1) {
        viewerEntry = buildEntry(viewerIdx + 1, opts.viewerFanId);
      }
    }

    return {
      monthStart: monthStartIso,
      monthLabel: formatMonthLabel(monthStart),
      artistSlug: opts.artistSlug,
      artistName,
      top,
      viewerEntry,
      totalFans: ranked.length,
    };
  } catch (err) {
    console.warn("gatherArtistLeaderboard failed (non-blocking):", err);
    return empty;
  }
}
