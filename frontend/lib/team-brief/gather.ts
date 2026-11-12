import { fanDisplayName, type FanNameParts } from "../format/fan-name.ts";
import { easternDateString } from "../dates/eastern.ts";
import { eventDayKey } from "../today/event-day.ts";
import {
  THANK_WINDOW_DAYS,
  selectSuperfansToThank,
  type FanEngagement,
  type ThankCandidate,
  type ThankCandidateInput,
} from "../superfans/to-thank.ts";

/**
 * Pure assembly of one artist's Monday team brief from raw rows. No I/O:
 * lib/team-brief/data.ts runs the queries, this file turns them into the
 * numbers the email (render.ts) and the portal page (/artist-portal/brief)
 * show. Same inputs, same brief.
 *
 * "Last week" is the seven days [periodStart, periodEnd) — Monday 00:00
 * UTC to the next Monday 00:00 UTC. Raw rows may reach further back (the
 * superfan selector wants 30 days); the window filter here is what keeps
 * the brief honest.
 */

export type Stamped = { fan_id: string; at: string | null };
export type Posted = { author_id: string; at: string | null };
export type Pointed = { fan_id: string; delta: number; at: string | null };

export type RawEvent = {
  id: string;
  title: string;
  event_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  url: string | null;
};

export type RawFan = FanNameParts & {
  id: string;
  email: string | null;
  is_internal: boolean;
  profile_slug: string | null;
  public_profile_enabled: boolean;
};

export type RawMembership = { fan_id: string; current_tier: string | null; total_points: number | null };

export type TeamBriefRaw = {
  community: { slug: string; displayName: string };
  period: { start: string; end: string };
  /** admin_users rows for the community (no super-admin '*' rows). */
  team: Array<{ user_id: string; role: string }>;
  follows: Stamped[];
  posts: Posted[];
  comments: Posted[];
  reactions: Stamped[];
  checkins: Stamped[];
  rsvps: Stamped[];
  redemptions: Stamped[];
  ledger: Pointed[];
  events: RawEvent[];
  pendingDrafts: number;
  /** superfan_thanks rows (0095) inside the cooldown window. */
  thanks: Array<{ fan_id: string; thanked_at: string | null }>;
  fans: RawFan[];
  memberships: RawMembership[];
};

export type TopFan = {
  fanId: string;
  name: string;
  points: number;
  tier: string | null;
  profilePath: string | null;
};

export type UpcomingEvent = {
  id: string;
  title: string;
  /** YYYY-MM-DD (Eastern) when it could be worked out. */
  day: string | null;
  /** The admin's free-form text, for display. */
  when: string | null;
  url: string | null;
};

export type SuperfanToThank = ThankCandidate & {
  name: string;
  tier: string | null;
  profilePath: string | null;
};

export type TeamBriefData = {
  community: { slug: string; displayName: string };
  period: { start: string; end: string };
  teamSize: number;
  stats: {
    newFollowers: number;
    postsByFans: number;
    postsByTeam: number;
    comments: number;
    reactions: number;
    checkins: number;
    rsvps: number;
    redemptions: number;
    pointsAwarded: number;
    activeFans: number;
  };
  topFans: TopFan[];
  upcomingEvents: UpcomingEvent[];
  pendingDrafts: number;
  superfansToThank: SuperfanToThank[];
};

export const TOP_FAN_LIMIT = 5;
export const UPCOMING_EVENT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function inWindow(at: string | null, start: string, end: string): boolean {
  return at != null && at >= start && at < end;
}

export function fanProfilePath(fan: RawFan | undefined): string | null {
  if (!fan?.profile_slug || !fan.public_profile_enabled) return null;
  return `/fans/${fan.profile_slug}`;
}

/** The brief's Mon→Mon window for a run at `now` (UTC). */
export function briefPeriod(now: Date): { start: string; end: string; weekStart: string } {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  const end = d.toISOString();
  const start = new Date(d.getTime() - 7 * DAY_MS).toISOString();
  return { start, end, weekStart: end.slice(0, 10) };
}

/** Newest-activity cutoff the raw loader should use (30 days before the window ends). */
export function engagementCutoffIso(periodEnd: string): string {
  return new Date(Date.parse(periodEnd) - THANK_WINDOW_DAYS * DAY_MS).toISOString();
}

/**
 * Per-fan 30-day engagement for the superfan selector, over every raw row
 * the loader returned (it already cut at `engagementCutoffIso`).
 */
export function buildEngagement(raw: TeamBriefRaw): Map<string, FanEngagement> {
  const map = new Map<string, FanEngagement>();
  const get = (fanId: string): FanEngagement => {
    let e = map.get(fanId);
    if (!e) {
      e = { fanId, pointsEarned: 0, comments: 0, reactions: 0, checkins: 0, rsvps: 0, redemptions: 0, lastActiveAt: null };
      map.set(fanId, e);
    }
    return e;
  };
  const touch = (e: FanEngagement, at: string | null) => {
    if (at && (!e.lastActiveAt || at > e.lastActiveAt)) e.lastActiveAt = at;
  };
  const bump = (rows: Stamped[], key: "reactions" | "checkins" | "rsvps" | "redemptions") => {
    for (const r of rows) {
      if (!r.fan_id) continue;
      const e = get(r.fan_id);
      e[key] += 1;
      touch(e, r.at);
    }
  };
  for (const r of raw.comments) {
    if (!r.author_id) continue;
    const e = get(r.author_id);
    e.comments += 1;
    touch(e, r.at);
  }
  bump(raw.reactions, "reactions");
  bump(raw.checkins, "checkins");
  bump(raw.rsvps, "rsvps");
  bump(raw.redemptions, "redemptions");
  for (const r of raw.ledger) {
    if (!r.fan_id || !(r.delta > 0)) continue;
    const e = get(r.fan_id);
    e.pointsEarned += r.delta;
    touch(e, r.at);
  }
  return map;
}

export function gatherTeamBrief(
  raw: TeamBriefRaw,
  now: Date,
  opts: { thankLimit?: number } = {},
): TeamBriefData {
  const { start, end } = raw.period;
  const teamIds = new Set(raw.team.map((t) => t.user_id));
  const fanById = new Map(raw.fans.map((f) => [f.id, f]));
  const tierById = new Map(raw.memberships.map((m) => [m.fan_id, m.current_tier]));

  const posts = raw.posts.filter((p) => inWindow(p.at, start, end));
  const comments = raw.comments.filter((c) => inWindow(c.at, start, end));
  const reactions = raw.reactions.filter((r) => inWindow(r.at, start, end));
  const checkins = raw.checkins.filter((r) => inWindow(r.at, start, end));
  const rsvps = raw.rsvps.filter((r) => inWindow(r.at, start, end));
  const redemptions = raw.redemptions.filter((r) => inWindow(r.at, start, end));
  const ledger = raw.ledger.filter((r) => r.delta > 0 && inWindow(r.at, start, end));

  const active = new Set<string>();
  for (const p of posts) active.add(p.author_id);
  for (const c of comments) active.add(c.author_id);
  for (const r of [...reactions, ...checkins, ...rsvps, ...redemptions]) active.add(r.fan_id);
  for (const id of teamIds) active.delete(id);
  active.delete("");

  // Top fans by points earned this week — never staff, never internal.
  const weekPoints = new Map<string, number>();
  for (const r of ledger) {
    if (!r.fan_id || teamIds.has(r.fan_id)) continue;
    if (fanById.get(r.fan_id)?.is_internal) continue;
    weekPoints.set(r.fan_id, (weekPoints.get(r.fan_id) ?? 0) + r.delta);
  }
  const topFans: TopFan[] = Array.from(weekPoints.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .slice(0, TOP_FAN_LIMIT)
    .map(([fanId, points]) => ({
      fanId,
      name: fanDisplayName(fanById.get(fanId)),
      points,
      tier: tierById.get(fanId) ?? null,
      profilePath: fanProfilePath(fanById.get(fanId)),
    }));

  // Upcoming events: today through +14 days on the Eastern calendar.
  const today = easternDateString(now);
  const horizon = easternDateString(new Date(now.getTime() + UPCOMING_EVENT_DAYS * DAY_MS));
  const upcomingEvents: UpcomingEvent[] = raw.events
    .map((e) => ({
      id: e.id,
      title: e.title,
      day: eventDayKey(e, now),
      when: e.event_date ?? (e.starts_at ? e.starts_at.slice(0, 10) : null),
      url: e.url,
    }))
    .filter((e) => e.day != null && e.day >= today && e.day <= horizon)
    .sort((a, b) => (a.day! < b.day! ? -1 : a.day! > b.day! ? 1 : a.title.localeCompare(b.title)));

  // Superfans to thank (30-day score, 60-day cooldown).
  const engagement = buildEngagement(raw);
  const latestThank = new Map<string, string>();
  for (const t of raw.thanks) {
    if (!t.thanked_at) continue;
    const cur = latestThank.get(t.fan_id);
    if (!cur || t.thanked_at > cur) latestThank.set(t.fan_id, t.thanked_at);
  }
  const candidates: ThankCandidateInput[] = Array.from(engagement.values())
    .filter((e) => !teamIds.has(e.fanId))
    .map((e) => ({
      ...e,
      isInternal: fanById.get(e.fanId)?.is_internal ?? false,
      thankedAt: latestThank.get(e.fanId) ?? null,
    }));
  const superfansToThank: SuperfanToThank[] = selectSuperfansToThank(candidates, { now, limit: opts.thankLimit }).map((c) => ({
    ...c,
    name: fanDisplayName(fanById.get(c.fanId)),
    tier: tierById.get(c.fanId) ?? null,
    profilePath: fanProfilePath(fanById.get(c.fanId)),
  }));

  return {
    community: raw.community,
    period: raw.period,
    teamSize: teamIds.size,
    stats: {
      newFollowers: raw.follows.filter((f) => inWindow(f.at, start, end)).length,
      postsByFans: posts.filter((p) => !teamIds.has(p.author_id)).length,
      postsByTeam: posts.filter((p) => teamIds.has(p.author_id)).length,
      comments: comments.length,
      reactions: reactions.length,
      checkins: checkins.length,
      rsvps: rsvps.length,
      redemptions: redemptions.length,
      pointsAwarded: ledger.reduce((sum, r) => sum + r.delta, 0),
      activeFans: active.size,
    },
    topFans,
    upcomingEvents,
    pendingDrafts: Math.max(0, raw.pendingDrafts),
    superfansToThank,
  };
}
