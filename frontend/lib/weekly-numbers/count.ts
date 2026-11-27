import { isInternalAccountEmail } from "../internal-accounts.ts";
import { weekIndexOf, type WeekWindow } from "./weeks.ts";

/**
 * Counting rules for the admin "Week by week" page. Pure: rows in, counts
 * out. The reads live in load.ts.
 *
 * Real fans only. A fan is left out of every number when the account is an
 * internal (team or test) account, is suspended, or uses a team or test
 * email address. A fan whose flags could not be found is left out too.
 *
 * A dataset that could not be read arrives as null and its numbers come out
 * as null, never as zero.
 */

/** Test addresses that are not on the internal list. */
const TEST_EMAIL_DOMAINS: readonly string[] = ["example.com", "example.org", "test.com"];

export const CHECKIN_SOURCE = "daily_checkin";
export const DROP_SOURCE = "daily_drop";

export type FanFlagRow = {
  id: string;
  is_internal: boolean | null;
  suspended: boolean | null;
  email: string | null;
};
export type MembershipRow = { fan_id: string; joined_at: string | null };
/** A positive points_ledger row for the community. */
export type ActivityRow = { fan_id: string; source: string; created_at: string };
export type AuthoredRow = { author_id: string; created_at: string };
export type RewardClaimedRow = { fan_id: string; created_at: string };
export type FriendRow = { referred_id: string | null; verified_at: string | null };

export type WeeklyNumbersInput = {
  /** Newest first (recentWeeks). */
  weeks: readonly WeekWindow[];
  /** Flags for every fan id that appears in the rows below. */
  fans: readonly FanFlagRow[] | null;
  /** Every active membership of the community. */
  memberships: readonly MembershipRow[] | null;
  /** Points earned in the community in the weeks shown. */
  activity: readonly ActivityRow[] | null;
  posts: readonly AuthoredRow[] | null;
  comments: readonly AuthoredRow[] | null;
  /** Reward redemptions that are not cancelled, created in the weeks shown. */
  rewardsClaimed: readonly RewardClaimedRow[] | null;
  /** Verified referrals for the community in the weeks shown. */
  friends: readonly FriendRow[] | null;
};

export type ReturningCount = {
  count: number;
  /** count / active fans that week, 0 to 1. Null when nobody was active. */
  share: number | null;
};

export type WeekNumbers = {
  week: WeekWindow;
  newFans: number | null;
  activeFans: number | null;
  returning: ReturningCount | null;
  checkIns: number | null;
  dropsClaimed: number | null;
  posts: number | null;
  comments: number | null;
  rewardsClaimed: number | null;
  friendsJoined: number | null;
};

export type Direction = "up" | "down" | "flat";
export type Comparison = { current: number; previous: number; change: number; direction: Direction };
export type SummaryLine = { label: string; comparison: Comparison | null };
export type WeekSummary = { week: WeekWindow; previousWeek: WeekWindow; lines: SummaryLine[] };

export type WeeklyNumbers = {
  /** Real, active fans of the community today. Null if it could not be read. */
  totalFans: number | null;
  rows: WeekNumbers[];
  /** The latest finished week against the one before it. */
  summary: WeekSummary | null;
};

export function isRealFan(fan: FanFlagRow | undefined): boolean {
  if (!fan) return false;
  if (fan.is_internal !== false || fan.suspended !== false) return false;
  const email = (fan.email ?? "").trim().toLowerCase();
  if (!email) return true;
  if (isInternalAccountEmail(email)) return false;
  return !TEST_EMAIL_DOMAINS.includes(email.slice(email.lastIndexOf("@") + 1));
}

function weekOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : weekIndexOf(at);
}

function countByWeek<Row>(
  rows: readonly Row[] | null,
  real: ReadonlySet<string> | null,
  fanOf: (row: Row) => string | null,
  whenOf: (row: Row) => string | null,
): Map<number, number> | null {
  if (!rows || !real) return null;
  const counts = new Map<number, number>();
  for (const row of rows) {
    const fan = fanOf(row);
    const week = weekOf(whenOf(row));
    if (!fan || week === null || !real.has(fan)) continue;
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return counts;
}

export function compare(current: number | null, previous: number | null): Comparison | null {
  if (current === null || previous === null) return null;
  const change = current - previous;
  return { current, previous, change, direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}

export function countWeeklyNumbers(input: WeeklyNumbersInput): WeeklyNumbers {
  const real = input.fans
    ? new Set(input.fans.filter((fan) => isRealFan(fan)).map((fan) => fan.id))
    : null;

  const realMemberships =
    input.memberships && real ? input.memberships.filter((m) => real.has(m.fan_id)) : null;
  const joinedWeek = new Map<string, number | null>();
  for (const m of realMemberships ?? []) joinedWeek.set(m.fan_id, weekOf(m.joined_at));

  const newFans = countByWeek(realMemberships, real, (m) => m.fan_id, (m) => m.joined_at);
  const ofSource = (source: string) =>
    countByWeek(
      input.activity ? input.activity.filter((row) => row.source === source) : null,
      real,
      (row) => row.fan_id,
      (row) => row.created_at,
    );
  const checkIns = ofSource(CHECKIN_SOURCE);
  const drops = ofSource(DROP_SOURCE);
  const posts = countByWeek(input.posts, real, (r) => r.author_id, (r) => r.created_at);
  const comments = countByWeek(input.comments, real, (r) => r.author_id, (r) => r.created_at);
  const claimed = countByWeek(input.rewardsClaimed, real, (r) => r.fan_id, (r) => r.created_at);
  const friends = countByWeek(input.friends, real, (r) => r.referred_id, (r) => r.verified_at);

  // Who earned points in each week.
  const activeByWeek = new Map<number, Set<string>>();
  if (input.activity && real) {
    for (const row of input.activity) {
      const week = weekOf(row.created_at);
      if (week === null || !real.has(row.fan_id)) continue;
      const set = activeByWeek.get(week) ?? new Set<string>();
      set.add(row.fan_id);
      activeByWeek.set(week, set);
    }
  }
  const canCountActive = Boolean(input.activity && real);

  const rows: WeekNumbers[] = input.weeks.map((week) => {
    const active = activeByWeek.get(week.index) ?? new Set<string>();
    let returning: ReturningCount | null = null;
    if (canCountActive && realMemberships) {
      // Returning: active this week and already a fan before it began.
      let count = 0;
      for (const fan of active) {
        const joined = joinedWeek.get(fan);
        if (joined === undefined || joined === null || joined < week.index) count += 1;
      }
      returning = { count, share: active.size > 0 ? count / active.size : null };
    }
    const at = (counts: Map<number, number> | null) => (counts ? (counts.get(week.index) ?? 0) : null);
    return {
      week,
      newFans: at(newFans),
      activeFans: canCountActive ? active.size : null,
      returning,
      checkIns: at(checkIns),
      dropsClaimed: at(drops),
      posts: at(posts),
      comments: at(comments),
      rewardsClaimed: at(claimed),
      friendsJoined: at(friends),
    };
  });

  const finished = rows.filter((row) => !row.week.inProgress);
  const summary: WeekSummary | null =
    finished.length >= 2
      ? {
          week: finished[0].week,
          previousWeek: finished[1].week,
          lines: [
            { label: "New fans", comparison: compare(finished[0].newFans, finished[1].newFans) },
            { label: "Active fans", comparison: compare(finished[0].activeFans, finished[1].activeFans) },
            {
              label: "Returning fans",
              comparison: compare(
                finished[0].returning?.count ?? null,
                finished[1].returning?.count ?? null,
              ),
            },
            { label: "Check-ins", comparison: compare(finished[0].checkIns, finished[1].checkIns) },
          ],
        }
      : null;

  return { totalFans: realMemberships ? realMemberships.length : null, rows, summary };
}
