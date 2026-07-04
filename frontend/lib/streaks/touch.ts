import { createAdminClient } from "@/lib/supabase/admin";
import { awardPoints } from "@/lib/points/award";

/**
 * Daily streak touch — call once per Fan Home render.
 *
 * Increments the fan's current streak if today is the day after their last
 * active date, resets to 1 if more than a day has passed, and no-ops if
 * we've already counted them today.
 *
 * Awards a small daily-login bonus (scales with streak length) and a
 * milestone bonus when a fan hits 7 / 30 / 100 / 365 days. Each event is
 * logged to public.streak_log for audit + UI debugging.
 *
 * Returns the post-touch streak state so the caller can render it without
 * a second round-trip.
 */

export interface StreakState {
  currentStreakDays: number;
  longestStreakDays: number;
  lastActiveDate: string | null;
  pointsAwardedThisVisit: number;
  newMilestone: number | null; // 7 / 30 / 100 / 365 — null if no milestone hit
  isNewToday: boolean;          // true if we incremented or reset on this call
}

/** Daily-login bonus scales with streak length. */
function dailyBonusForStreak(streakDays: number): number {
  if (streakDays >= 100) return 20;
  if (streakDays >= 30) return 15;
  if (streakDays >= 7) return 10;
  return 5;
}

/** Milestone bonuses (one-time) at 7 / 30 / 100 / 365 days. */
const MILESTONES: Record<number, number> = {
  7: 50,
  30: 200,
  100: 1000,
  365: 5000,
};

/** True when `today` is exactly one calendar day after `lastDate` (UTC). */
function isConsecutiveDay(today: Date, lastDate: Date): boolean {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const todayMidnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const lastMidnight = Date.UTC(
    lastDate.getUTCFullYear(),
    lastDate.getUTCMonth(),
    lastDate.getUTCDate(),
  );
  return todayMidnight - lastMidnight === oneDayMs;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Touch the streak for a fan. Idempotent within the same calendar day.
 * Returns the post-touch streak state.
 *
 * Failure mode: if anything throws (Supabase down, missing fan id, etc.)
 * we swallow the error and return a benign zero-state. Streak is a UX
 * affordance, not a contract — never block Fan Home from rendering.
 */
export async function touchStreak(
  fanId: string,
  communityId?: string,
): Promise<StreakState> {
  const benign: StreakState = {
    currentStreakDays: 0,
    longestStreakDays: 0,
    lastActiveDate: null,
    pointsAwardedThisVisit: 0,
    newMilestone: null,
    isNewToday: false,
  };

  if (!fanId) return benign;

  try {
    const admin = createAdminClient();
    const { data: fan, error: fetchError } = await admin
      .from("fans")
      .select(
        "id, current_streak_days, longest_streak_days, last_active_date, total_points",
      )
      .eq("id", fanId)
      .maybeSingle();

    if (fetchError || !fan) return benign;

    const today = new Date();
    const todayDateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD UTC

    let currentStreak = fan.current_streak_days as number;
    const longestSoFar = fan.longest_streak_days as number;
    const lastActive = fan.last_active_date
      ? new Date(`${fan.last_active_date}T00:00:00Z`)
      : null;

    let eventType:
      | "increment"
      | "reset"
      | "first_visit"
      | "no_op" = "no_op";
    let isNewToday = false;

    if (!lastActive) {
      currentStreak = 1;
      eventType = "first_visit";
      isNewToday = true;
    } else if (isSameDay(today, lastActive)) {
      // Already counted today — pure no-op, no points awarded.
      return {
        currentStreakDays: currentStreak,
        longestStreakDays: longestSoFar,
        lastActiveDate: fan.last_active_date as string,
        pointsAwardedThisVisit: 0,
        newMilestone: null,
        isNewToday: false,
      };
    } else if (isConsecutiveDay(today, lastActive)) {
      currentStreak += 1;
      eventType = "increment";
      isNewToday = true;
    } else {
      currentStreak = 1;
      eventType = "reset";
      isNewToday = true;
    }

    // Daily-login bonus
    const dailyBonus = dailyBonusForStreak(currentStreak);

    // Milestone check (one-time; only fires when we hit exact threshold)
    const milestoneHit = MILESTONES[currentStreak] ?? null;
    const milestoneBonus = milestoneHit ? MILESTONES[currentStreak] : 0;

    const totalAwarded = dailyBonus + milestoneBonus;
    const newLongest = Math.max(longestSoFar, currentStreak);

    // 1. Update fan streak fields (not points — awardPoints handles that)
    const updates: Record<string, unknown> = {
      current_streak_days: currentStreak,
      longest_streak_days: newLongest,
      last_active_date: todayDateStr,
    };
    if (eventType === "first_visit" || eventType === "reset") {
      updates.streak_started_at = today.toISOString();
    }
    await admin.from("fans").update(updates).eq("id", fanId);

    // 2. Award points via shared utility (updates fans + fan_community_memberships)
    if (totalAwarded > 0) {
      await awardPoints(admin, {
        fanId,
        delta: dailyBonus,
        source: "daily_checkin",
        sourceRef: `streak:${fanId}:${todayDateStr}`,
        note: `Day ${currentStreak} streak bonus`,
        ...(communityId ? { communityId } : {}),
      });
      if (milestoneBonus > 0 && milestoneHit) {
        await awardPoints(admin, {
          fanId,
          delta: milestoneBonus,
          source: "manual_adjustment",
          sourceRef: `streak-milestone:${fanId}:${milestoneHit}`,
          note: `Streak milestone: ${milestoneHit} days`,
          ...(communityId ? { communityId } : {}),
        });
      }
    }

    // 3. Audit log
    await admin.from("streak_log").insert([
      {
        fan_id: fanId,
        event_type: eventType,
        streak_days: currentStreak,
        points_awarded: dailyBonus,
        metadata: { kind: "daily_bonus" },
      },
      ...(milestoneHit
        ? [
            {
              fan_id: fanId,
              event_type: "milestone" as const,
              streak_days: currentStreak,
              points_awarded: milestoneBonus,
              milestone_days: milestoneHit,
              metadata: { badge_slug: `streak-${milestoneHit}` },
            },
          ]
        : []),
    ]);

    // 3. Award the badge if a milestone was hit. Table is `fan_badges`
    //    (verified against FE Supabase schema) with columns:
    //    fan_id, badge_slug, earned_at, community_id (NOT NULL, default 'raelynn').
    //    Streak badges are platform-level, but the column requires a value
    //    so we use the fan's first followed community if known, else fall
    //    back to the seed default. Idempotent on (fan_id, badge_slug).
    if (milestoneHit) {
      // Try to use the fan's first followed community, fallback to 'raelynn'.
      const { data: firstFollow } = await admin
        .from("fan_artist_following")
        .select("artist_slug")
        .eq("fan_id", fanId)
        .order("followed_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const communityId =
        (firstFollow?.artist_slug as string | undefined) ?? "raelynn";

      await admin
        .from("fan_badges")
        .upsert(
          {
            fan_id: fanId,
            badge_slug: `streak-${milestoneHit}`,
            earned_at: today.toISOString(),
            community_id: communityId,
          },
          { onConflict: "fan_id,badge_slug", ignoreDuplicates: true },
        );
    }

    return {
      currentStreakDays: currentStreak,
      longestStreakDays: newLongest,
      lastActiveDate: todayDateStr,
      pointsAwardedThisVisit: totalAwarded,
      newMilestone: milestoneHit,
      isNewToday,
    };
  } catch (err) {
    // Streak is non-essential — never let it crash Fan Home.
    // eslint-disable-next-line no-console
    console.warn("touchStreak failed (non-blocking):", err);
    return benign;
  }
}

/** Days until next milestone. Returns null if past the highest milestone. */
export function daysToNextMilestone(currentStreak: number): {
  next: number;
  daysRemaining: number;
} | null {
  for (const m of [7, 30, 100, 365]) {
    if (currentStreak < m) {
      return { next: m, daysRemaining: m - currentStreak };
    }
  }
  return null;
}
