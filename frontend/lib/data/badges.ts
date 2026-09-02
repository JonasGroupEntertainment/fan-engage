import { createClient } from "@/lib/supabase/server";
import { getCurrentCommunityId } from "@/lib/community";
import { foundingFanBadgeEarned } from "@/lib/founding-fan-badge";
import type { Badge } from "./types";

/**
 * Full badge list, joined with the current user's earned status + progress
 * toward threshold where applicable. Returns an empty list when the user
 * isn't signed in or Supabase isn't reachable — pages fall back to their
 * static preview rows.
 */
export async function getBadgesWithEarnedStatus(): Promise<Badge[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: badges, error: badgesErr } = await supabase
      .from("badges")
      .select("slug,name,description,icon,point_value,category,threshold,sort_order")
      .order("sort_order", { ascending: true });
    if (badgesErr) throw badgesErr;
    if (!badges || badges.length === 0) return [];

    if (!user) {
      return badges.map(
        (b) =>
          ({ ...b, earned: false, earned_at: null, progress: null }) as Badge,
      );
    }

    // Parallel fetch: what's earned + each count-based progress metric.
    // Only count-based badges (community, referral) need a running total.
    const communityId = await getCurrentCommunityId();
    const [earnedRes, postCountRes, commentCountRes, pollVoteCountRes,
           challengeEntryCountRes, referralVerifiedCountRes, membershipRes] = await Promise.all([
      supabase
        .from("fan_badges")
        .select("badge_slug,earned_at")
        .eq("fan_id", user.id),
      supabase
        .from("community_posts")
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id)
        .eq("kind", "post"),
      supabase
        .from("community_comments")
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id),
      supabase
        .from("community_poll_votes")
        .select("post_id", { count: "exact", head: true })
        .eq("fan_id", user.id),
      supabase
        .from("community_challenge_entries")
        .select("id", { count: "exact", head: true })
        .eq("fan_id", user.id),
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id)
        .eq("status", "verified"),
      supabase
        .from("fan_community_memberships")
        .select("founding_fan_number")
        .eq("fan_id", user.id)
        .eq("community_id", communityId)
        .maybeSingle(),
    ]);

    const earnedMap = new Map(
      (earnedRes.data ?? []).map((r) => [r.badge_slug, r.earned_at as string]),
    );

    // Map slug → current progress toward threshold.
    const postCount = postCountRes.count ?? 0;
    const commentCount = commentCountRes.count ?? 0;
    const pollVoteCount = pollVoteCountRes.count ?? 0;
    const challengeEntryCount = challengeEntryCountRes.count ?? 0;
    const referralCount = referralVerifiedCountRes.count ?? 0;

    const progressBySlug: Record<string, number> = {
      "first-post": postCount,
      "first-comment": commentCount,
      "poll-voter-5": pollVoteCount,
      "challenge-crasher-10": challengeEntryCount,
      "chatterbox-25": commentCount,
      "referral-1": referralCount,
      "referral-5": referralCount,
      "referral-10": referralCount,
    };

    const foundingFanNumber =
      (membershipRes.data?.founding_fan_number as number | null | undefined) ??
      null;

    return badges.map((b) => {
      const alreadyEarned = earnedMap.has(b.slug);
      const earned = foundingFanBadgeEarned({
        slug: b.slug,
        alreadyEarned,
        foundingFanNumber,
      });
      return {
        ...b,
        earned,
        earned_at: earnedMap.get(b.slug) ?? null,
        progress: progressBySlug[b.slug] ?? null,
      };
    }) as Badge[];
  } catch {
    return [];
  }
}
