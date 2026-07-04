import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fan monthly recap — the fan-facing "wrapped" for the last 30 days:
 * points earned by source, streaks, badges earned, and community rank.
 */

const SOURCE_LABELS: Record<string, string> = {
  daily_visit: "Daily visits",
  streak_bonus: "Streak bonuses",
  daily_drop: "Daily drops",
  comment: "Comments",
  reaction: "Reactions",
  rsvp: "Event RSVPs",
  referral: "Referrals",
  challenge: "Challenges",
  challenge_winner: "Challenge wins",
  quiz: "Quizzes",
  presave: "Pre-saves",
  share: "Shares",
  badge: "Badges",
  admin: "Bonus awards",
  signup: "Joining",
};

export interface RecapSource {
  source: string;
  label: string;
  points: number;
}

export interface FanRecap {
  fanName: string | null;
  communityId: string;
  communityName: string;
  pointsEarned30d: number;
  totalPoints: number;
  sources: RecapSource[];
  activeDays30d: number;
  currentStreakDays: number;
  longestStreakDays: number;
  badgesEarned30d: Array<{ slug: string; name: string; icon: string | null }>;
  rank: number | null;
  memberCount: number;
}

export async function gatherFanRecap(
  fanId: string,
  communityId: string,
): Promise<FanRecap> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [fan, community, ledger, badgeRows, membership, memberCountRes] =
    await Promise.all([
      admin
        .from("fans")
        .select("handle, first_name, last_name, total_points, current_streak_days, longest_streak_days")
        .eq("id", fanId)
        .maybeSingle(),
      admin
        .from("communities")
        .select("display_name")
        .eq("slug", communityId)
        .maybeSingle(),
      admin
        .from("points_ledger")
        .select("delta, source, created_at")
        .eq("fan_id", fanId)
        .eq("community_id", communityId)
        .gte("created_at", since),
      admin
        .from("fan_badges")
        .select("badge_slug, earned_at, badges(name, icon)")
        .eq("fan_id", fanId)
        .eq("community_id", communityId)
        .gte("earned_at", since),
      admin
        .from("fan_community_memberships")
        .select("total_points")
        .eq("fan_id", fanId)
        .eq("community_id", communityId)
        .maybeSingle(),
      admin
        .from("fan_community_memberships")
        .select("fan_id", { count: "exact", head: true })
        .eq("community_id", communityId),
    ]);

  const rows = (ledger.data ?? []) as Array<{
    delta: number;
    source: string | null;
    created_at: string;
  }>;

  const bySource = new Map<string, number>();
  let pointsEarned30d = 0;
  const activeDates = new Set<string>();
  for (const r of rows) {
    activeDates.add(r.created_at.slice(0, 10));
    if (r.delta > 0) {
      pointsEarned30d += r.delta;
      const key = r.source ?? "other";
      bySource.set(key, (bySource.get(key) ?? 0) + r.delta);
    }
  }
  const sources: RecapSource[] = [...bySource.entries()]
    .map(([source, points]) => ({
      source,
      label: SOURCE_LABELS[source] ?? source.replace(/_/g, " "),
      points,
    }))
    .sort((a, b) => b.points - a.points);

  // Rank within the community by membership points.
  const myPoints = (membership.data?.total_points as number | undefined) ?? 0;
  let rank: number | null = null;
  if (membership.data) {
    const { count } = await admin
      .from("fan_community_memberships")
      .select("fan_id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .gt("total_points", myPoints);
    rank = (count ?? 0) + 1;
  }

  const badges = ((badgeRows.data ?? []) as unknown as Array<{
    badge_slug: string;
    badges:
      | { name: string; icon: string | null }
      | Array<{ name: string; icon: string | null }>
      | null;
  }>).map((b) => {
    const meta = Array.isArray(b.badges) ? b.badges[0] : b.badges;
    return {
      slug: b.badge_slug,
      name: meta?.name ?? b.badge_slug,
      icon: meta?.icon ?? null,
    };
  });

  const f = fan.data as
    | {
        handle: string | null;
        first_name: string | null;
        last_name: string | null;
        total_points: number | null;
        current_streak_days: number | null;
        longest_streak_days: number | null;
      }
    | null;

  return {
    fanName:
      f?.handle || [f?.first_name, f?.last_name].filter(Boolean).join(" ") || null,
    communityId,
    communityName:
      (community.data?.display_name as string | undefined) ?? communityId,
    pointsEarned30d,
    totalPoints: f?.total_points ?? 0,
    sources,
    activeDays30d: activeDates.size,
    currentStreakDays: f?.current_streak_days ?? 0,
    longestStreakDays: f?.longest_streak_days ?? 0,
    badgesEarned30d: badges,
    rank,
    memberCount: memberCountRes.count ?? 0,
  };
}

/** One warm hype line via Haiku; deterministic fallback without a key. */
export async function generateHypeLine(recap: FanRecap): Promise<string> {
  const fallback =
    recap.pointsEarned30d > 0
      ? `You showed up ${recap.activeDays30d} day${recap.activeDays30d === 1 ? "" : "s"} and earned ${recap.pointsEarned30d.toLocaleString()} points this month — ${recap.communityName} is lucky to have you.`
      : `A quiet month — but ${recap.communityName} misses you, and your ${recap.totalPoints.toLocaleString()} points aren't going anywhere.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 120,
        system:
          "Write ONE warm, specific hype sentence (max 30 words) celebrating a music super-fan's month, using only the numbers provided. Second person. No emoji, no hashtags, no invented facts. Reply with the sentence only.",
        messages: [{ role: "user", content: JSON.stringify(recap) }],
      }),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = json.content.find((c) => c.type === "text")?.text?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}
