/**
 * "Today" row — pure selection of up to four chips that answer "what can I
 * do right now" on Fan Home. Data gathering lives in lib/data/fan-home.ts;
 * this module takes already-shaped inputs so it can be unit-tested without
 * Supabase.
 *
 * Priority (first wins the accent gradient):
 *   1. checkin — fan has not checked in today at a followed artist, and an
 *      artist is check-in-able: it has an event today OR the fan has checked
 *      in there before (a check-in happens at the venue, so we never nudge a
 *      fan toward an artist they have no reason to be near).
 *   2. event   — "Tonight: <title>" for a followed artist's event today.
 *      Near events (fan + venue coordinates, under NEAR_YOU_MILES) win,
 *      then the closest, then the soonest.
 *   3. posts   — "N new posts" since the fan's last visit.
 *   4. streak  — "Day N ✓" when last active today, "Day N — keep it going"
 *      when last active yesterday — on the UTC calendar touch.ts keeps
 *      (streakTodayKey / streakYesterdayKey). Older than that: no chip.
 *   5. reward  — "Unclaimed: <title>" for the priciest reward the fan can
 *      afford and has not redeemed.
 */

export type TodayItemKind = "checkin" | "event" | "posts" | "streak" | "reward";

export interface TodayItem {
  kind: TodayItemKind;
  label: string;
  href: string;
  /** Short secondary text, e.g. "RaeLynn · 42 mi". Optional. */
  hint?: string;
}

export interface TodayFollowedArtist {
  slug: string;
  name: string | null;
}

export interface TodayEvent {
  id: string;
  artist_slug: string;
  title: string;
  /** Eastern YYYY-MM-DD the event happens on; null when unknown. */
  dayKey: string | null;
  starts_at: string | null;
  distanceMiles: number | null;
  nearYou: boolean;
  url?: string | null;
}

export interface TodayCheckin {
  artist_slug: string;
  /** Eastern YYYY-MM-DD of the check-in. */
  dayKey: string;
}

export interface TodayReward {
  id: string;
  title: string;
  point_cost: number;
  community_id: string | null;
  requires_tier: "premium" | "founder-only" | null;
  redeemed: boolean;
}

export interface TodayInput {
  /** Eastern YYYY-MM-DD for "now" (events, check-ins). */
  todayKey: string;
  /** Eastern YYYY-MM-DD for the day before `todayKey`. */
  yesterdayKey: string;
  /**
   * The streak keeps its own calendar: lib/streaks/touch.ts stamps and
   * compares fans.last_active_date on the UTC day, so the chip must too or
   * a fan on the US east coast sees "Day 5 — keep it going" at 8 PM when
   * touch.ts already counted them today. UTC YYYY-MM-DD for "now" and the
   * day before; default to the Eastern keys for callers that predate them.
   */
  streakTodayKey?: string;
  streakYesterdayKey?: string;
  followedArtists: TodayFollowedArtist[];
  events: TodayEvent[];
  checkins: TodayCheckin[];
  newPosts: { count: number; capped: boolean; href: string };
  streak: { currentStreakDays: number; lastActiveDate: string | null; href: string };
  rewards: TodayReward[];
  points: number;
  premiumCommunities: string[];
  founderCommunities: string[];
  /** Where a reward chip with no community goes. */
  rewardsHref: string;
}

export const MAX_TODAY_ITEMS = 4;

function eventsToday(input: TodayInput): TodayEvent[] {
  const followed = new Set(input.followedArtists.map((a) => a.slug));
  return input.events
    .filter((e) => e.dayKey === input.todayKey && followed.has(e.artist_slug))
    .sort((a, b) => {
      if (a.nearYou !== b.nearYou) return a.nearYou ? -1 : 1;
      const ad = a.distanceMiles ?? Number.POSITIVE_INFINITY;
      const bd = b.distanceMiles ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      const at = a.starts_at ? Date.parse(a.starts_at) : Number.POSITIVE_INFINITY;
      const bt = b.starts_at ? Date.parse(b.starts_at) : Number.POSITIVE_INFINITY;
      return at - bt;
    });
}

export function selectCheckinItem(input: TodayInput): TodayItem | null {
  const checkedInToday = new Set(
    input.checkins.filter((c) => c.dayKey === input.todayKey).map((c) => c.artist_slug),
  );
  if (input.followedArtists.some((a) => checkedInToday.has(a.slug))) return null;

  const everCheckedIn = new Set(input.checkins.map((c) => c.artist_slug));
  const liveToday = eventsToday(input);
  const withEvent = liveToday.find((e) => !checkedInToday.has(e.artist_slug));
  const slug =
    withEvent?.artist_slug ??
    input.followedArtists.find((a) => everCheckedIn.has(a.slug))?.slug ??
    null;
  if (!slug) return null;
  const artist = input.followedArtists.find((a) => a.slug === slug);
  return {
    kind: "checkin",
    label: "Check in today",
    href: `/artists/${slug}/checkin`,
    hint: artist?.name ?? undefined,
  };
}

export function selectEventItem(input: TodayInput): TodayItem | null {
  const [e] = eventsToday(input);
  if (!e) return null;
  const artist = input.followedArtists.find((a) => a.slug === e.artist_slug);
  const bits = [artist?.name ?? null, e.distanceMiles != null ? `${e.distanceMiles} mi` : null]
    .filter(Boolean);
  return {
    kind: "event",
    label: `Tonight: ${e.title}`,
    href: `/artists/${e.artist_slug}`,
    hint: bits.length ? bits.join(" · ") : undefined,
  };
}

export function selectPostsItem(input: TodayInput): TodayItem | null {
  const { count, capped, href } = input.newPosts;
  if (count < 1) return null;
  const n = capped ? `${count}+` : String(count);
  return {
    kind: "posts",
    label: `${n} new ${count === 1 && !capped ? "post" : "posts"}`,
    href,
  };
}

export function selectStreakItem(input: TodayInput): TodayItem | null {
  const { currentStreakDays, lastActiveDate, href } = input.streak;
  if (currentStreakDays < 1 || !lastActiveDate) return null;
  const todayKey = input.streakTodayKey ?? input.todayKey;
  const yesterdayKey = input.streakYesterdayKey ?? input.yesterdayKey;
  if (lastActiveDate === todayKey) {
    return { kind: "streak", label: `Day ${currentStreakDays} ✓`, href };
  }
  if (lastActiveDate === yesterdayKey) {
    return { kind: "streak", label: `Day ${currentStreakDays} — keep it going`, href };
  }
  return null;
}

export function selectRewardItem(input: TodayInput): TodayItem | null {
  const affordable = input.rewards
    .filter((r) => !r.redeemed && r.point_cost > 0 && r.point_cost <= input.points)
    .filter((r) => {
      if (!r.requires_tier) return true;
      if (!r.community_id) return false;
      return r.requires_tier === "founder-only"
        ? input.founderCommunities.includes(r.community_id)
        : input.premiumCommunities.includes(r.community_id);
    })
    .sort((a, b) => b.point_cost - a.point_cost);
  const [r] = affordable;
  if (!r) return null;
  return {
    kind: "reward",
    label: `Unclaimed: ${r.title}`,
    href: r.community_id ? `/artists/${r.community_id}/rewards` : input.rewardsHref,
    hint: `${r.point_cost.toLocaleString("en-US")} pts`,
  };
}

/** Up to MAX_TODAY_ITEMS chips in priority order. Empty array → render nothing. */
export function selectTodayItems(input: TodayInput): TodayItem[] {
  return [
    selectCheckinItem(input),
    selectEventItem(input),
    selectPostsItem(input),
    selectStreakItem(input),
    selectRewardItem(input),
  ]
    .filter((item): item is TodayItem => item !== null)
    .slice(0, MAX_TODAY_ITEMS);
}
