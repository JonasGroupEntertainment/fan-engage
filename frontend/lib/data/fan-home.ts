import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rejectPlaceholderDraftPosts } from "@/lib/community/placeholder-draft";
import type { Badge, FanProfile } from "./types";

export interface FanHomeFollowedArtist {
  slug: string;
  name: string;
  tagline: string | null;
  accent_from: string;
  accent_to: string;
  hero_image: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
}

/**
 * One upcoming event surfaced on Fan Home. Sourced from `artist_events`
 * filtered to the fan's followed artists — RSVP is NOT required (the widget
 * is a discovery surface, not a personal calendar). The `rsvped` flag lets
 * the dashboard show a "✓ Going" indicator when the fan has already RSVPed.
 */
export interface FanHomeUpcomingEvent {
  id: string;
  artist_slug: string;
  artist_name: string | null;
  title: string;
  starts_at: string | null;
  event_date: string | null;
  location: string | null;
  url: string | null;
  rsvped: boolean;
  has_scheduled_reminder: boolean;
}

/**
 * @deprecated Back-compat shim — alias for `FanHomeUpcomingEvent`. New code
 * should consume `upcomingEvents: FanHomeUpcomingEvent[]` instead. Kept so
 * any older imports of `FanHomeNextEvent` continue to type-check during the
 * dashboard rollout. Remove once all consumers have migrated.
 */
export type FanHomeNextEvent = FanHomeUpcomingEvent;

export interface FanHomeCTA {
  id: string;
  artist_slug: string;
  artist_name: string | null;
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  cta_label: string;
  point_value: number;
  completed: boolean;
}

export interface FanHomeActivityPost {
  id: string;
  artist_slug: string;
  artist_name: string | null;
  kind: string;
  title: string | null;
  body: string;
  author_first_name: string | null;
  created_at: string;
  pinned: boolean;
  /** Phase 5e: post visibility tier. 'premium' posts are body-gated unless
   * the viewer has a premium/comped/past_due membership. 'founder-only' posts
   * are body-gated unless the viewer is a founder in that community. */
  visibility: "public" | "premium" | "founder-only";
}

export interface FanHomeBadgeProgress {
  slug: string;
  name: string;
  icon: string | null;
  threshold: number;
  progress: number;
  point_value: number;
}

export interface FanHomeData {
  fan: FanProfile;
  followedArtists: FanHomeFollowedArtist[];
  /**
   * Next 3 upcoming public-tier events from any artist the fan follows.
   * Sorted by `starts_at` ascending. Empty array if the fan follows no artists
   * or none of the followed artists have upcoming public events.
   */
  upcomingEvents: FanHomeUpcomingEvent[];
  /**
   * @deprecated Back-compat shim — equivalent to `upcomingEvents[0] ?? null`.
   * The previous Fan Home dashboard rendered a single "Next event" card; new
   * code should use `upcomingEvents` instead. Kept so an older deployed
   * dashboard build can still pull this prop while the new component rolls
   * out. Remove once the component has migrated to `upcomingEvents`.
   */
  nextEvent: FanHomeUpcomingEvent | null;
  ctas: FanHomeCTA[];
  recentActivity: FanHomeActivityPost[];
  badgesInProgress: FanHomeBadgeProgress[];
  totalEarnedBadges: number;
  totalBadgeCount: number;
  /**
   * Phase 5d: the set of community slugs where the viewer currently has
   * premium/comped/past_due membership. Consumed by the dashboard to decide
   * whether to reveal the body of premium-tier posts in Recent Activity.
   */
  premiumCommunities: string[];
  /**
   * Phase 5e: the set of community slugs where the viewer is a founder
   * (is_founder=true). Consumed by the dashboard to decide whether to
   * reveal the body of founder-only posts in Recent Activity.
   */
  founderCommunities: string[];
}

/**
 * One-shot fetch of everything the personalized Fan Home needs. Runs all
 * subqueries in parallel against the admin client (service role) since
 * public views are read-only by design.
 */
export async function getFanHomeData(): Promise<FanHomeData | null> {
  try {
    return await _getFanHomeData();
  } catch (err) {
    console.error("[getFanHomeData] failed, returning null:", err);
    return null;
  }
}

async function _getFanHomeData(): Promise<FanHomeData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Fan profile
  const { data: fan } = await admin
    .from("fans").select("*, current_streak_days, longest_streak_days, last_active_date")
    .eq("id", user.id)
    .maybeSingle();

  if (!fan) return null;

  // Followed artists (pull artist metadata in one go)
  const { data: follows } = await admin
    .from("fan_artist_following")
    .select("artist_slug")
    .eq("fan_id", user.id);
  const followedSlugs = (follows ?? []).map((f) => f.artist_slug as string);

  const artistsPromise = followedSlugs.length
    ? admin
        .from("artists")
        .select("slug, name, tagline, accent_from, accent_to, hero_image, hero_focal_x, hero_focal_y")
        .in("slug", followedSlugs)
        .eq("active", true)
    : Promise.resolve({ data: [] as Array<{
        slug: string;
        name: string;
        tagline: string | null;
        accent_from: string;
        accent_to: string;
        hero_image: string | null;
        hero_focal_x: number | null;
        hero_focal_y: number | null;
      }> });

  // Upcoming public-tier events from followed artists. Discovery-style:
  // RSVP not required. Limit slightly higher than 3 so we have headroom if
  // any rows get filtered out post-fetch (e.g. starts_at NULL placeholders).
  const nowIso = new Date().toISOString();
  const upcomingEventsPromise = followedSlugs.length
    ? admin
        .from("artist_events")
        .select("id, artist_slug, title, starts_at, event_date, location, url, tier, active")
        .in("artist_slug", followedSlugs)
        .eq("active", true)
        .eq("tier", "public")
        .not("starts_at", "is", null)
        .gt("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(8)
    : Promise.resolve({ data: [] as Array<{
        id: string;
        artist_slug: string;
        title: string;
        starts_at: string | null;
        event_date: string | null;
        location: string | null;
        url: string | null;
        tier: string;
        active: boolean;
      }> });

  // Fan's RSVPs — used to compute `rsvped` flag on the upcoming events.
  const myRsvpsPromise = admin
    .from("event_rsvps")
    .select("event_id")
    .eq("fan_id", user.id);

  // Active fan_actions across followed artists (or all if none followed)
  let ctasQuery = admin
    .from("fan_actions")
    .select("id, artist_slug, kind, title, description, url, cta_label, point_value")
    .eq("active", true)
    .order("sort_order");
  if (followedSlugs.length > 0) {
    ctasQuery = ctasQuery.in("artist_slug", followedSlugs);
  }
  const ctasPromise = ctasQuery;

  // Fan's CTA completions (for computing `completed`)
  const completionsPromise = admin
    .from("fan_action_completions")
    .select("action_id")
    .eq("fan_id", user.id);

  // Recent community posts from followed artists
  const activityPromise = followedSlugs.length
    ? admin
        .from("community_posts")
        .select("id, artist_slug, kind, title, body, author_id, pinned, created_at, visibility")
        .in("artist_slug", followedSlugs)
        .order("created_at", { ascending: false })
        .limit(5)
    : Promise.resolve({ data: [] as Array<{
        id: string;
        artist_slug: string;
        kind: string;
        title: string | null;
        body: string;
        author_id: string;
        pinned: boolean;
        created_at: string;
        visibility: "public" | "premium" | "founder-only";
      }> });

  // Phase 5d: viewer's premium memberships across followed communities.
  // Used to decide which premium posts to body-reveal in Recent Activity.
  const premiumCommunitiesPromise = followedSlugs.length
    ? admin
        .from("fan_community_memberships")
        .select("community_id, subscription_tier")
        .eq("fan_id", user.id)
        .in("community_id", followedSlugs)
        .in("subscription_tier", ["premium", "comped", "past_due"])
    : Promise.resolve({ data: [] as Array<{ community_id: string; subscription_tier: string }> });

  // Phase 5e: viewer's founder status across followed communities.
  // Used to decide which founder-only posts to body-reveal in Recent Activity.
  const founderCommunitiesPromise = followedSlugs.length
    ? admin
        .from("fan_community_memberships")
        .select("community_id")
        .eq("fan_id", user.id)
        .eq("is_founder", true)
        .in("community_id", followedSlugs)
    : Promise.resolve({ data: [] as Array<{ community_id: string }> });

  // Badge progress — get all badges + earned set + compute progress for
  // count-based ones that aren't earned yet.
  const badgesPromise = admin
    .from("badges")
    .select("slug, name, icon, point_value, category, threshold, sort_order")
    .order("sort_order");

  const earnedPromise = admin
    .from("fan_badges")
    .select("badge_slug")
    .eq("fan_id", user.id);

  const postCountPromise = admin
    .from("community_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .eq("kind", "post");

  const commentCountPromise = admin
    .from("community_comments")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id);

  const pollVoteCountPromise = admin
    .from("community_poll_votes")
    .select("post_id", { count: "exact", head: true })
    .eq("fan_id", user.id);

  const entryCountPromise = admin
    .from("community_challenge_entries")
    .select("id", { count: "exact", head: true })
    .eq("fan_id", user.id);

  const referralCountPromise = admin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", user.id)
    .eq("status", "verified");

  // Reminder rows — used to compute has_scheduled_reminder per upcoming event.
  const remindersPromise = admin
    .from("event_reminders")
    .select("event_id, kind");

  const [
    artistsRes,
    upcomingEventsRes,
    myRsvpsRes,
    ctasRes,
    completionsRes,
    activityRes,
    badgesRes,
    earnedRes,
    postCountRes,
    commentCountRes,
    pollVoteCountRes,
    entryCountRes,
    referralCountRes,
    remindersRes,
    premiumCommunitiesRes,
    founderCommunitiesRes,
  ] = await Promise.all([
    artistsPromise,
    upcomingEventsPromise,
    myRsvpsPromise,
    ctasPromise,
    completionsPromise,
    activityPromise,
    badgesPromise,
    earnedPromise,
    postCountPromise,
    commentCountPromise,
    pollVoteCountPromise,
    entryCountPromise,
    referralCountPromise,
    remindersPromise,
    premiumCommunitiesPromise,
    founderCommunitiesPromise,
  ]);

  const premiumCommunities = ((premiumCommunitiesRes.data ?? []) as Array<{
    community_id: string;
  }>).map((r) => r.community_id);
  const founderCommunities = ((founderCommunitiesRes.data ?? []) as Array<{
    community_id: string;
  }>).map((r) => r.community_id);

  const followedArtists = (artistsRes.data ?? []) as FanHomeFollowedArtist[];
  const artistNameBySlug = new Map(followedArtists.map((a) => [a.slug, a.name]));

  // Build the upcoming-events list. Limit to top 3 after applying any
  // post-fetch filtering (none today, but headroom is cheap).
  const myRsvpedIds = new Set(
    ((myRsvpsRes.data ?? []) as Array<{ event_id: string }>).map((r) => r.event_id),
  );
  const reminders = (remindersRes.data ?? []) as Array<{ event_id: string; kind: string }>;
  const remindersByEvent = new Map<string, Set<string>>();
  for (const r of reminders) {
    if (!remindersByEvent.has(r.event_id)) remindersByEvent.set(r.event_id, new Set());
    remindersByEvent.get(r.event_id)!.add(r.kind);
  }

  const upcomingEvents: FanHomeUpcomingEvent[] = ((upcomingEventsRes.data ?? []) as Array<{
    id: string;
    artist_slug: string;
    title: string;
    starts_at: string | null;
    event_date: string | null;
    location: string | null;
    url: string | null;
  }>)
    .slice(0, 3)
    .map((e) => {
      const reminderKinds = remindersByEvent.get(e.id) ?? new Set<string>();
      return {
        id: e.id,
        artist_slug: e.artist_slug,
        artist_name: artistNameBySlug.get(e.artist_slug) ?? null,
        title: e.title,
        starts_at: e.starts_at,
        event_date: e.event_date,
        location: e.location,
        url: e.url,
        rsvped: myRsvpedIds.has(e.id),
        has_scheduled_reminder:
          reminderKinds.has("reminder_24h") || reminderKinds.has("reminder_1h"),
      };
    });

  const completedIds = new Set(
    (completionsRes.data ?? []).map((r) => r.action_id as string),
  );
  const ctas: FanHomeCTA[] = ((ctasRes.data ?? []) as Array<{
    id: string;
    artist_slug: string;
    kind: string;
    title: string;
    description: string | null;
    url: string | null;
    cta_label: string;
    point_value: number;
  }>).slice(0, 6).map((c) => ({
    id: c.id,
    artist_slug: c.artist_slug,
    artist_name: artistNameBySlug.get(c.artist_slug) ?? null,
    kind: c.kind,
    title: c.title,
    description: c.description,
    url: c.url,
    cta_label: c.cta_label,
    point_value: c.point_value,
    completed: completedIds.has(c.id),
  }));

  // Recent activity — pull author names for nicer display
  const authorIds = [...new Set(((activityRes.data ?? []) as Array<{ author_id: string }>).map((p) => p.author_id))];
  let authorNameById = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: authors } = await admin
      .from("fans")
      .select("id, first_name")
      .in("id", authorIds);
    authorNameById = new Map(
      (authors ?? []).map((a) => [a.id as string, (a.first_name as string | null) ?? null]),
    );
  }

  const recentActivity: FanHomeActivityPost[] = rejectPlaceholderDraftPosts(
    (activityRes.data ?? []) as Array<{
    id: string;
    artist_slug: string;
    kind: string;
    title: string | null;
    body: string;
    author_id: string;
    pinned: boolean;
    created_at: string;
    visibility: "public" | "premium" | "founder-only" | null;
  }>,
  ).map((p) => ({
    id: p.id,
    artist_slug: p.artist_slug,
    artist_name: artistNameBySlug.get(p.artist_slug) ?? null,
    kind: p.kind,
    title: p.title,
    body: p.body,
    author_first_name: authorNameById.get(p.author_id) ?? null,
    created_at: p.created_at,
    pinned: p.pinned,
    visibility: (p.visibility ?? "public") as "public" | "premium" | "founder-only",
  }));

  // Badges in progress
  const earnedSet = new Set(
    (earnedRes.data ?? []).map((r) => r.badge_slug as string),
  );

  const progressBySlug: Record<string, number> = {
    "first-post": postCountRes.count ?? 0,
    "first-comment": commentCountRes.count ?? 0,
    "poll-voter-5": pollVoteCountRes.count ?? 0,
    "challenge-crasher-10": entryCountRes.count ?? 0,
    "chatterbox-25": commentCountRes.count ?? 0,
    "referral-1": referralCountRes.count ?? 0,
    "referral-5": referralCountRes.count ?? 0,
    "referral-10": referralCountRes.count ?? 0,
  };

  const allBadges = ((badgesRes.data ?? []) as Array<Badge & { threshold: number | null; sort_order: number }>);

  const badgesInProgress: FanHomeBadgeProgress[] = allBadges
    .filter((b) => !earnedSet.has(b.slug) && typeof b.threshold === "number" && b.threshold > 0)
    .map((b) => ({
      slug: b.slug,
      name: b.name,
      icon: b.icon,
      threshold: b.threshold as number,
      progress: progressBySlug[b.slug] ?? 0,
      point_value: b.point_value,
    }))
    .sort((a, b) => {
      // Closest-to-threshold first
      const aGap = a.threshold - a.progress;
      const bGap = b.threshold - b.progress;
      return aGap - bGap;
    })
    .slice(0, 3);

  const totalEarnedBadges = earnedSet.size;
  const totalBadgeCount = allBadges.length;

  return {
    fan: fan as FanProfile,
    followedArtists,
    upcomingEvents,
    // Back-compat: the previous dashboard renders the first upcoming event
    // as its "Next event" card. Safe to drop once the component rolls out.
    nextEvent: upcomingEvents[0] ?? null,
    ctas,
    recentActivity,
    badgesInProgress,
    totalEarnedBadges,
    totalBadgeCount,
    premiumCommunities,
    founderCommunities,
  };
}
