import type { SupabaseClient } from "@supabase/supabase-js";
import { pageAll, pageAllIn, type PageQuery } from "../supabase/page-all.ts";
import {
  countWeeklyNumbers,
  type ActivityRow,
  type AuthoredRow,
  type FanFlagRow,
  type FriendRow,
  type MembershipRow,
  type RewardClaimedRow,
  type WeeklyNumbers,
} from "./count.ts";
import { recentWeeks } from "./weeks.ts";

/**
 * Reads for the admin "Week by week" page. Counts only: no names, no
 * emails and no per-fan rows leave this module. Every list is read a page
 * at a time, and a list that cannot be read is reported and shown as
 * unknown instead of zero.
 */

export type WeeklyNumbersResult = WeeklyNumbers & {
  /** Plain names of the lists that could not be read. */
  unread: string[];
};

type Read<Row> = { rows: Row[] | null; failed: boolean };

async function readAll<Row>(make: () => PageQuery<Row>): Promise<Read<Row>> {
  try {
    const res = await pageAll(make);
    return res.error ? { rows: null, failed: true } : { rows: res.data, failed: false };
  } catch {
    return { rows: null, failed: true };
  }
}

function uniqueIds(...lists: ReadonlyArray<ReadonlyArray<string | null> | null>): string[] {
  const ids = new Set<string>();
  for (const list of lists) for (const id of list ?? []) if (id) ids.add(id);
  return [...ids];
}

export async function loadWeeklyNumbers(
  admin: SupabaseClient,
  communityId: string,
  now: Date = new Date(),
): Promise<WeeklyNumbersResult> {
  const weeks = recentWeeks(now);
  const since = weeks[weeks.length - 1].startIso;
  const q = <Row>(builder: unknown) => builder as PageQuery<Row>;

  const [memberships, activity, posts, comments, rewardsClaimed, friends] = await Promise.all([
    readAll<MembershipRow>(() =>
      q(
        admin
          .from("fan_community_memberships")
          .select("fan_id, joined_at")
          .eq("community_id", communityId)
          .eq("status", "active")
          .order("fan_id", { ascending: true }),
      ),
    ),
    readAll<ActivityRow>(() =>
      q(
        admin
          .from("points_ledger")
          .select("fan_id, source, created_at")
          .eq("community_id", communityId)
          .gt("delta", 0)
          .gte("created_at", since)
          .order("id", { ascending: true }),
      ),
    ),
    readAll<AuthoredRow>(() =>
      q(
        admin
          .from("community_posts")
          .select("author_id, created_at")
          .eq("community_id", communityId)
          .gte("created_at", since)
          .order("id", { ascending: true }),
      ),
    ),
    readAll<AuthoredRow>(() =>
      q(
        admin
          .from("community_comments")
          .select("author_id, created_at, post:community_posts!inner(community_id)")
          .eq("post.community_id", communityId)
          .gte("created_at", since)
          .order("id", { ascending: true }),
      ),
    ),
    readAll<RewardClaimedRow>(() =>
      q(
        admin
          .from("reward_redemptions")
          .select("fan_id, created_at")
          .eq("community_id", communityId)
          .neq("status", "cancelled")
          .gte("created_at", since)
          .order("id", { ascending: true }),
      ),
    ),
    readAll<FriendRow>(() =>
      q(
        admin
          .from("referrals")
          .select("referred_id, verified_at")
          .eq("community_id", communityId)
          .eq("status", "verified")
          .gte("verified_at", since)
          .order("id", { ascending: true }),
      ),
    ),
  ]);

  const ids = uniqueIds(
    memberships.rows?.map((r) => r.fan_id) ?? null,
    activity.rows?.map((r) => r.fan_id) ?? null,
    posts.rows?.map((r) => r.author_id) ?? null,
    comments.rows?.map((r) => r.author_id) ?? null,
    rewardsClaimed.rows?.map((r) => r.fan_id) ?? null,
    friends.rows?.map((r) => r.referred_id) ?? null,
  );
  let fans: FanFlagRow[] | null = [];
  if (ids.length > 0) {
    try {
      const res = await pageAllIn<FanFlagRow, string>(ids, (part) =>
        q(
          admin
            .from("fans")
            .select("id, is_internal, suspended, email")
            .in("id", part)
            .order("id", { ascending: true }),
        ),
      );
      fans = res.error ? null : res.data;
    } catch {
      fans = null;
    }
  }

  const unread = [
    memberships.failed ? "fans" : null,
    activity.failed ? "points activity" : null,
    posts.failed ? "posts" : null,
    comments.failed ? "comments" : null,
    rewardsClaimed.failed ? "rewards" : null,
    friends.failed ? "friends who joined" : null,
    fans === null ? "account checks" : null,
  ].filter((name): name is string => name !== null);

  const numbers = countWeeklyNumbers({
    weeks,
    fans,
    memberships: memberships.rows,
    activity: activity.rows,
    posts: posts.rows,
    comments: comments.rows,
    rewardsClaimed: rewardsClaimed.rows,
    friends: friends.rows,
  });
  return { ...numbers, unread };
}
