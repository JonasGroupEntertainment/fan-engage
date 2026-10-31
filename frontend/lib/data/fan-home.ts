import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rejectPlaceholderDraftPosts } from "@/lib/community/placeholder-draft";
import { getAdminContext } from "@/lib/admin";
import { roleAtLeast } from "@/lib/admin-authz";
import { selectWithOptionalEventGeo } from "@/lib/data/event-select";
import { isPastEvent } from "@/lib/data/artists";
import { eventDistance, fanHomeCoords } from "@/lib/geo/near";
import { eventDayKey } from "@/lib/today/event-day";
import { selectTodayItems, type TodayItem } from "@/lib/today/select";
import { easternDateString } from "@/lib/dates/eastern";
import { shouldListLaunchReward } from "@/lib/launch-catalog";
import { getCurrentCommunityId } from "@/lib/community";
import { pickViewerCommunity } from "@/lib/viewer-community";
import {
  evaluateRsvpWindow,
  grantManagesEventRsvps,
  rsvpWindowView,
  type RsvpAdminGrant,
} from "@/lib/rsvp-window";
import type { Badge, FanProfile } from "./types";
import { isMissingScheduledColumnError, scheduledPostsVisibleFilter } from "@/lib/data/scheduled-posts";
import { canReadPostInCommunity } from "@/lib/founder-gate/core";

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
  /**
   * "Early access" during a Founding Fan head start, or the sentence
   * that says when RSVP opens. Null when RSVP is open now.
   */
  rsvpStatusLabel: string | null;
  /** Venue city / state from migration 0090; null until an admin fills them in. */
  city: string | null;
  region: string | null;
  /**
   * Whole miles from the fan's home (fans.home_lat/lng) to the venue
   * (artist_events.lat/lng). Null when either side has no coordinates —
   * the UI never shows a distance it cannot stand behind.
   */
  distanceMiles: number | null;
  /** True when `distanceMiles` exists and is under NEAR_YOU_MILES (75). */
  nearYou: boolean;
}

export type { TodayItem } from "@/lib/today/select";

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
   * are body-gated unless the viewer is a founder in that community.
   * A Founding Fan who is not Premium does not inherit premium posts. */
  visibility: "public" | "premium" | "founder-only";
  /** False when body was cleared because this fan cannot read the post. */
  canReadBody: boolean;
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
  /**
   * The community the dashboard links into for rewards etc.: the hostname
   * community when the fan follows it, else their first followed artist,
   * else the hostname community (which falls back to DEFAULT_COMMUNITY_SLUG).
   */
  primaryCommunity: string;
  /**
   * Sprint 3: "Today" row — up to four chips answering "what can I do
   * right now" (check in, tonight's show, new posts, streak, unclaimed
   * reward). Empty when there is nothing to do; the dashboard then renders
   * no row at all. Selection is pure (lib/today/select.ts).
   */
  today: TodayItem[];
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

  // Upcoming events from followed artists. Discovery-style: RSVP not
  // required. Premium / founder-only events are kept when the fan is
  // entitled in that community (filtered after the membership reads land).
  // Limit is higher than 3 for headroom after that post-fetch filter.
  const nowIso = new Date().toISOString();
  const upcomingEventsPromise = loadHomeUpcomingEvents(admin, followedSlugs, nowIso);

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
  type ActivityRow = {
    id: string;
    artist_slug: string;
    kind: string;
    title: string | null;
    author_id: string;
    pinned: boolean;
    created_at: string;
    visibility: "public" | "premium" | "founder-only";
  };
  // Titles only. Bodies are loaded afterwards with the fan's own session
  // so the service role cannot hand a gated body to Fan Home.
  const activityQuery = (withScheduledFilter: boolean) => {
    let q = admin
      .from("community_posts")
      .select("id, artist_slug, kind, title, author_id, pinned, created_at, visibility")
      .in("artist_slug", followedSlugs);
    // Service-role read on a fan's behalf: hide scheduled posts (0094).
    if (withScheduledFilter) q = q.or(scheduledPostsVisibleFilter());
    return q.order("created_at", { ascending: false }).limit(5);
  };
  const activityPromise: Promise<{ data: ActivityRow[] | null }> = followedSlugs.length
    ? (async () => {
        const first = await activityQuery(true);
        // Until 0094 is applied the column does not exist — fall back to the
        // unfiltered read rather than an empty Recent Activity.
        const res =
          first.error && isMissingScheduledColumnError(first.error) ? await activityQuery(false) : first;
        return { data: (res.data ?? null) as ActivityRow[] | null };
      })()
    : Promise.resolve({ data: [] as ActivityRow[] });

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

  const foundingNumbersPromise = admin
    .from("fan_community_memberships")
    .select("community_id, founding_fan_number")
    .eq("fan_id", user.id);

  const adminGrantsPromise = admin
    .from("admin_users")
    .select("community_id, role")
    .eq("user_id", user.id);

  const adminCtxPromise = getAdminContext().catch(() => null);

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

  // Today row, extra query 1 of 2: the fan's recent check-ins at followed
  // artists. Drives "Check in today" (not yet today, and a venue reason:
  // event today or checked in there before).
  const checkinsPromise = followedSlugs.length
    ? admin
        .from("checkins")
        .select("artist_slug, created_at")
        .eq("fan_id", user.id)
        .in("artist_slug", followedSlugs)
        .order("created_at", { ascending: false })
        .limit(100)
    : Promise.resolve({ data: [] as Array<{ artist_slug: string; created_at: string }>, error: null });

  // Today row, extra query 2 of 2: rewards the fan can afford, with the
  // fan's own redemptions embedded (PostgREST filters the embed, not the
  // parent, so unredeemed rewards come back with an empty array).
  const fanPoints = Number(fan.total_points ?? 0);
  const rewardsPromise = fanPoints > 0
    ? admin
        .from("rewards_catalog")
        .select(
          "id, title, point_cost, community_id, requires_tier, active, stock, drops_at, expires_at, clip_url, in_app_only, reward_redemptions(fan_id)",
        )
        .eq("active", true)
        .gt("point_cost", 0)
        .lte("point_cost", fanPoints)
        .or(
          followedSlugs.length
            ? `community_id.in.(${followedSlugs.join(",")}),community_id.is.null`
            : "community_id.is.null",
        )
        .eq("reward_redemptions.fan_id", user.id)
        .order("point_cost", { ascending: false })
        .limit(25)
    : Promise.resolve({ data: [] as TodayRewardRow[], error: null });

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
    foundingNumbersRes,
    adminGrantsRes,
    adminCtx,
    checkinsRes,
    rewardsRes,
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
    foundingNumbersPromise,
    adminGrantsPromise,
    adminCtxPromise,
    checkinsPromise,
    rewardsPromise,
  ]);

  const premiumCommunities = ((premiumCommunitiesRes.data ?? []) as Array<{
    community_id: string;
  }>).map((r) => r.community_id);
  const founderCommunities = ((founderCommunitiesRes.data ?? []) as Array<{
    community_id: string;
  }>).map((r) => r.community_id);

  const followedArtists = (artistsRes.data ?? []) as FanHomeFollowedArtist[];
  const artistNameBySlug = new Map(followedArtists.map((a) => [a.slug, a.name]));
  const primaryCommunity = pickViewerCommunity({
    memberSlugs: followedArtists.map((a) => a.slug),
    hostSlug: await getCurrentCommunityId(),
  });

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

  const foundingNumberByCommunity = new Map<string, number | null>();
  for (const row of (foundingNumbersRes.data ?? []) as Array<{
    community_id: string;
    founding_fan_number: number | null;
  }>) {
    foundingNumberByCommunity.set(row.community_id, row.founding_fan_number);
  }
  const rsvpGrants: RsvpAdminGrant[] = (
    (adminGrantsRes.data ?? []) as Array<{ community_id: string; role: string | null }>
  ).map((row) => ({ communityId: row.community_id, role: row.role }));
  const superAdminManages =
    Boolean(adminCtx?.isSuperAdmin) && roleAtLeast(adminCtx?.role ?? null, "editor");

  const fanHome = fanHomeCoords(fan as FanProfile);
  const visibleUpcoming = upcomingEventsRes.filter((e) =>
    homeEventVisible(e.tier, e.artist_slug, { premiumCommunities, founderCommunities }),
  );

  const upcomingEvents: FanHomeUpcomingEvent[] = visibleUpcoming
    .slice(0, 3)
    .map((e) => {
      const reminderKinds = remindersByEvent.get(e.id) ?? new Set<string>();
      const view = rsvpWindowView(
        evaluateRsvpWindow({
          now: new Date(),
          rsvpOpensAt: e.rsvp_opens_at,
          foundingFanNumber: foundingNumberByCommunity.get(e.artist_slug) ?? null,
          isAdmin:
            superAdminManages || grantManagesEventRsvps(rsvpGrants, e.artist_slug),
        }),
      );
      const rsvpStatusLabel =
        view.state === "early-access"
          ? "Early access"
          : view.state === "closed"
            ? view.closedMessage
            : null;
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
        rsvpStatusLabel,
        city: e.city,
        region: e.region,
        ...eventDistance(fanHome, { lat: e.lat, lng: e.lng }),
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

  const activityRows = (activityRes.data ?? []) as Array<{
    id: string;
    artist_slug: string;
    kind: string;
    title: string | null;
    author_id: string;
    pinned: boolean;
    created_at: string;
    visibility: "public" | "premium" | "founder-only" | null;
  }>;
  const staffReadCommunities = [
    ...((adminCtx?.isSuperAdmin ? ["*"] : []) as string[]),
    ...rsvpGrants.map((g) => g.communityId),
  ];
  const bodyById = new Map<string, string>();
  if (activityRows.length > 0) {
    const { data: bodyRows } = await supabase
      .from("community_posts")
      .select("id, body, visibility")
      .in("id", activityRows.map((p) => p.id));
    for (const row of bodyRows ?? []) {
      bodyById.set(row.id as string, (row.body as string | null) ?? "");
    }
  }
  const recentActivity: FanHomeActivityPost[] = rejectPlaceholderDraftPosts(activityRows.map((p) => {
    const visibility = (p.visibility ?? "public") as "public" | "premium" | "founder-only";
    const allowed = canReadPostInCommunity(
      { visibility, author_id: p.author_id, artist_slug: p.artist_slug },
      {
        fanId: user.id,
        premiumCommunities,
        founderCommunities,
        staffCommunities: staffReadCommunities,
      },
    );
    return {
      id: p.id,
      artist_slug: p.artist_slug,
      artist_name: artistNameBySlug.get(p.artist_slug) ?? null,
      kind: p.kind,
      title: p.title,
      body: allowed ? (bodyById.get(p.id) ?? "") : "",
      author_first_name: authorNameById.get(p.author_id) ?? null,
      created_at: p.created_at,
      pinned: p.pinned,
      visibility,
      canReadBody: allowed,
    };
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

  const today = buildTodayItems({
    now: new Date(),
    fan: fan as FanProfile & { last_active_date?: string | null; current_streak_days?: number | null },
    followedArtists,
    events: visibleUpcoming,
    fanHome,
    checkins: (checkinsRes.data ?? []) as Array<{ artist_slug: string; created_at: string }>,
    recentActivity,
    rewards: rewardsRes.error ? [] : ((rewardsRes.data ?? []) as unknown as TodayRewardRow[]),
    premiumCommunities,
    founderCommunities,
    primaryCommunity,
  });

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
    primaryCommunity,
    today,
  };
}

type TodayRewardRow = {
  id: string;
  title: string;
  point_cost: number;
  community_id: string | null;
  requires_tier: "premium" | "founder-only" | null;
  active: boolean;
  stock: number | null;
  drops_at: string | null;
  expires_at: string | null;
  clip_url: string | null;
  in_app_only: boolean;
  reward_redemptions: Array<{ fan_id: string }> | null;
};

/** Eastern YYYY-MM-DD for the day before `now`. */
function easternYesterday(now: Date): string {
  return easternDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

/** UTC YYYY-MM-DD — the calendar lib/streaks/touch.ts keeps last_active_date on. */
function utcDateString(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Shape the already-loaded Fan Home reads into the pure Today selector's
 * input. No queries here — the two extra reads (checkins, rewards) ran in
 * the main Promise.all.
 */
function buildTodayItems(args: {
  now: Date;
  fan: FanProfile & { last_active_date?: string | null; current_streak_days?: number | null };
  followedArtists: FanHomeFollowedArtist[];
  events: HomeUpcomingRow[];
  fanHome: ReturnType<typeof fanHomeCoords>;
  checkins: Array<{ artist_slug: string; created_at: string }>;
  recentActivity: FanHomeActivityPost[];
  rewards: TodayRewardRow[];
  premiumCommunities: string[];
  founderCommunities: string[];
  primaryCommunity: string;
}): TodayItem[] {
  const { now, fan } = args;
  const todayKey = easternDateString(now);
  const nowMs = now.getTime();

  // "New posts since last visit": last_active_date is the streak's UTC
  // day marker (lib/streaks/touch.ts), which touchStreak has already
  // bumped to today by the time Fan Home renders. So "since last visit"
  // means posts created today or later than the previous active day —
  // count posts newer than the start of the last active day (UTC). Recent
  // Activity is capped at 5, so the count is capped too ("5+ new posts").
  const lastActive = fan.last_active_date ?? null;
  const sinceMs = lastActive ? Date.parse(`${lastActive}T00:00:00Z`) : Number.NaN;
  const newCount = Number.isFinite(sinceMs)
    ? args.recentActivity.filter((p) => Date.parse(p.created_at) > sinceMs).length
    : 0;
  const postsHref = `/artists/${args.primaryCommunity}/community`;

  return selectTodayItems({
    todayKey,
    yesterdayKey: easternYesterday(now),
    streakTodayKey: utcDateString(now),
    streakYesterdayKey: utcDateString(new Date(nowMs - 24 * 60 * 60 * 1000)),
    followedArtists: args.followedArtists.map((a) => ({ slug: a.slug, name: a.name })),
    events: args.events.map((e) => ({
      id: e.id,
      artist_slug: e.artist_slug,
      title: e.title,
      dayKey: eventDayKey(e, now),
      starts_at: e.starts_at,
      url: e.url,
      ...eventDistance(args.fanHome, { lat: e.lat, lng: e.lng }),
    })),
    checkins: args.checkins
      .filter((c) => Number.isFinite(Date.parse(c.created_at)))
      .map((c) => ({
        artist_slug: c.artist_slug,
        dayKey: easternDateString(new Date(c.created_at)),
      })),
    newPosts: { count: newCount, capped: newCount >= 5, href: postsHref },
    streak: {
      currentStreakDays: Number(fan.current_streak_days ?? 0),
      lastActiveDate: lastActive,
      href: "/activity",
    },
    rewards: args.rewards
      .filter((r) => r.stock !== 0)
      .filter((r) => !r.drops_at || Date.parse(r.drops_at) <= nowMs)
      .filter((r) => !r.expires_at || Date.parse(r.expires_at) > nowMs)
      .filter((r) => shouldListLaunchReward(r, { signedIn: true }))
      .map((r) => ({
        id: r.id,
        title: r.title,
        point_cost: r.point_cost,
        community_id: r.community_id,
        requires_tier: r.requires_tier,
        redeemed: (r.reward_redemptions?.length ?? 0) > 0,
      })),
    points: Number(fan.total_points ?? 0),
    premiumCommunities: args.premiumCommunities,
    founderCommunities: args.founderCommunities,
    rewardsHref: "/rewards",
  });
}

type HomeUpcomingRow = {
  id: string;
  artist_slug: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  event_date: string | null;
  location: string | null;
  url: string | null;
  tier: "public" | "premium" | "founder-only";
  rsvp_opens_at: string | null;
  /** Migration 0090. Null until applied / filled in. */
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Same rule as the artist hub's `canAccess`: public events for everyone,
 * premium events for fans with a Premium membership in that community,
 * founder-only events for Founding Fans there. Gated events the fan is not
 * entitled to are dropped from Fan Home (the hub shows the paywall instead).
 */
export function homeEventVisible(
  tier: HomeUpcomingRow["tier"],
  artistSlug: string,
  viewer: { premiumCommunities: string[]; founderCommunities: string[] },
): boolean {
  if (tier === "public") return true;
  if (tier === "founder-only") return viewer.founderCommunities.includes(artistSlug);
  return viewer.premiumCommunities.includes(artistSlug);
}

/**
 * Upcoming = not past by `ends_at ?? starts_at` (see `isPastEvent`), so an
 * event that is in progress right now is still listed. Rows with neither
 * timestamp are kept for the same reason the artist hub keeps them, and
 * sort after dated rows.
 */
async function loadHomeUpcomingEvents(
  admin: ReturnType<typeof createAdminClient>,
  followedSlugs: string[],
  nowIso: string,
): Promise<HomeUpcomingRow[]> {
  if (followedSlugs.length === 0) return [];
  const columns =
    "id, artist_slug, title, starts_at, ends_at, event_date, location, url, tier, active";
  const { data, error } = await selectWithOptionalEventGeo(
    (cols) =>
      admin
        .from("artist_events")
        .select(cols)
        .in("artist_slug", followedSlugs)
        .eq("active", true)
        .or(
          `ends_at.gt.${nowIso},and(ends_at.is.null,starts_at.gt.${nowIso}),and(ends_at.is.null,starts_at.is.null)`,
        )
        .order("starts_at", { ascending: true, nullsFirst: false })
        .limit(16),
    columns,
  );
  if (error || !data) return [];
  const now = Date.parse(nowIso);
  type RawRow = Omit<HomeUpcomingRow, "rsvp_opens_at" | "tier" | "city" | "region" | "lat" | "lng"> & {
    tier?: string | null;
    rsvp_opens_at?: string | null;
    city?: string | null;
    region?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  return (data as unknown as RawRow[])
    .filter((row) => !isPastEvent(row, now))
    .map((row) => ({
      id: row.id,
      artist_slug: row.artist_slug,
      title: row.title,
      starts_at: row.starts_at,
      ends_at: row.ends_at ?? null,
      event_date: row.event_date,
      location: row.location,
      url: row.url,
      tier: (row.tier === "premium" || row.tier === "founder-only" ? row.tier : "public") as HomeUpcomingRow["tier"],
      rsvp_opens_at: row.rsvp_opens_at ?? null,
      city: row.city ?? null,
      region: row.region ?? null,
      lat: typeof row.lat === "number" ? row.lat : null,
      lng: typeof row.lng === "number" ? row.lng : null,
    }));
}
