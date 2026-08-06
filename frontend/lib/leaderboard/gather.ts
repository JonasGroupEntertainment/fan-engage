import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ArtistMonthlyLeaderboard,
  LeaderboardEntry,
} from "./types";

const SCORE_WEIGHTS = {
  reaction: 1,
  comment: 3,
  rsvp: 5,
  redemption: 10,
} as const;

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
 * Implementation: 4 parallel COUNT-style queries scoped to the month and
 * artist, merged in TS into a per-fan score map. Then sort, slice, and
 * resolve display names + avatars in a single batch read on `fans`.
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
            .gte("created_at", monthStartIso)
            .lt("created_at", nextMonthIso)
        : Promise.resolve({ data: [] as Array<{ fan_id: string }> });

    // Redemptions are scoped via reward_redemptions.community_id == artistSlug.
    // Some platforms set community_id to null for global rewards; we
    // intentionally exclude those from the per-artist leaderboard.
    const redemptionsPromise = admin
      .from("reward_redemptions")
      .select("fan_id, status")
      .eq("community_id", opts.artistSlug)
      .neq("status", "cancelled")
      .gte("created_at", monthStartIso)
      .lt("created_at", nextMonthIso);

    const [reactionsRes, commentsRes, rsvpsRes, redemptionsRes] =
      await Promise.all([
        reactionsPromise,
        commentsPromise,
        rsvpsPromise,
        redemptionsPromise,
      ]);

    // Aggregate into per-fan score map.
    const scores = new Map<
      string,
      Pick<LeaderboardEntry, "reactions" | "comments" | "rsvps" | "redemptions" | "score">
    >();

    function bump(
      fanId: string,
      key: "reactions" | "comments" | "rsvps" | "redemptions",
      pts: number,
    ) {
      const cur = scores.get(fanId) ?? {
        reactions: 0,
        comments: 0,
        rsvps: 0,
        redemptions: 0,
        score: 0,
      };
      cur[key] += 1;
      cur.score += pts;
      scores.set(fanId, cur);
    }

    for (const r of reactionsRes.data ?? [])
      bump(r.fan_id as string, "reactions", SCORE_WEIGHTS.reaction);
    for (const c of commentsRes.data ?? [])
      bump(c.author_id as string, "comments", SCORE_WEIGHTS.comment);
    for (const r of rsvpsRes.data ?? [])
      bump(r.fan_id as string, "rsvps", SCORE_WEIGHTS.rsvp);
    for (const r of redemptionsRes.data ?? [])
      bump(r.fan_id as string, "redemptions", SCORE_WEIGHTS.redemption);

    if (scores.size === 0) {
      return { ...empty, artistName };
    }

    // Sort by score desc; tie-break by fan_id for stability (could refine to
    // earliest-activity timestamp if ties matter visually).
    const sorted = Array.from(scores.entries()).sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return a[0].localeCompare(b[0]);
    });

    // Resolve display names + avatars + tier in a single batch
    const fanIds = sorted.map(([fanId]) => fanId);
    const { data: fanRows } = await admin
      .from("fans")
      .select("id, first_name, last_name, avatar_url, current_tier, profile_slug, public_profile_enabled")
      .in("id", fanIds);
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
      const first = (f.first_name as string | null) ?? "";
      const last = (f.last_name as string | null) ?? "";
      const display = [first, last].filter(Boolean).join(" ").trim() || "A fan";
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
        reactions: s.reactions,
        comments: s.comments,
        rsvps: s.rsvps,
        redemptions: s.redemptions,
      };
    }

    const top: LeaderboardEntry[] = sorted
      .slice(0, topN)
      .map(([fanId], idx) => buildEntry(idx + 1, fanId));

    let viewerEntry: LeaderboardEntry | null = null;
    if (opts.viewerFanId) {
      const viewerIdx = sorted.findIndex(([id]) => id === opts.viewerFanId);
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
      totalFans: sorted.length,
    };
  } catch (err) {
    console.warn("gatherArtistLeaderboard failed (non-blocking):", err);
    return empty;
  }
}
