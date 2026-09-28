import { verifyCronAuth } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gatherArtistLeaderboard } from "@/lib/leaderboard/gather";
import {
  notifyFirstPlace,
  notifyMonthEndNudge,
  notifyOvertaken,
} from "@/lib/notifications/triggers/leaderboard";

/**
 * Cron: GET /api/cron/leaderboard-notifications
 *
 * Runs once daily at 16:00 UTC via vercel.json (late morning in the US,
 * since SMS ignores quiet hours).
 *
 * For every active artist community:
 *   1. Compute today's leaderboard with gatherArtistLeaderboard.
 *   2. Upsert a leaderboard_snapshots row per fan.
 *   3. Compare with yesterday's snapshot to detect rank changes.
 *   4. Fire push notifications:
 *      - notifyFirstPlace   → fan newly reached rank 1
 *      - notifyOvertaken    → fan's rank got worse vs yesterday
 *      - notifyMonthEndNudge → fired when ≤ 3 days remain in the month
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (same pattern as all other
 * cron routes in this project).
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** How many days before month-end to send the nudge. */
const NUDGE_DAYS_THRESHOLD = 3;

/** Max fans to notify per community per run (safety cap). */
const MAX_NOTIFY_PER_COMMUNITY = 500;

function daysLeftInMonth(now: Date): number {
  const lastDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return lastDay - now.getUTCDate();
}

function todayDateString(now: Date): string {
  // Returns YYYY-MM-DD in UTC
  return now.toISOString().slice(0, 10);
}

function yesterdayDateString(now: Date): string {
  const y = new Date(now.getTime() - 86_400_000);
  return y.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const admin = createAdminClient();
  const now = new Date();
  const today = todayDateString(now);
  const yesterday = yesterdayDateString(now);
  const daysLeft = daysLeftInMonth(now);
  const sendNudge = daysLeft <= NUDGE_DAYS_THRESHOLD;

  const summary: {
    communities: number;
    snapshotsUpserted: number;
    notificationsFirstPlace: number;
    notificationsOvertaken: number;
    notificationsNudge: number;
    errors: string[];
  } = {
    communities: 0,
    snapshotsUpserted: 0,
    notificationsFirstPlace: 0,
    notificationsOvertaken: 0,
    notificationsNudge: 0,
    errors: [],
  };

  // Fetch all active artist slugs.
  const { data: artists, error: artistsErr } = await admin
    .from("artists")
    .select("slug, name")
    .eq("active", true);

  if (artistsErr || !artists) {
    return NextResponse.json(
      { ok: false, error: artistsErr?.message ?? "no artists" },
      { status: 500 },
    );
  }

  for (const artist of artists) {
    const artistSlug = artist.slug as string;
    const artistName = (artist.name as string | null) ?? artistSlug;

    try {
      // ── 1. Compute today's leaderboard ──────────────────────────────
      const leaderboard = await gatherArtistLeaderboard({
        artistSlug,
        topN: MAX_NOTIFY_PER_COMMUNITY,
      });
      if (!leaderboard || leaderboard.top.length === 0) continue;

      summary.communities += 1;

      // ── 2. Upsert today's snapshots ──────────────────────────────────
      const upsertRows = leaderboard.top.map((entry) => ({
        community_slug: artistSlug,
        fan_id: entry.fan_id,
        rank: entry.rank,
        points: entry.score,
        snapshot_date: today,
      }));

      const { error: upsertErr } = await admin
        .from("leaderboard_snapshots")
        .upsert(upsertRows, {
          onConflict: "community_slug,fan_id,snapshot_date",
        });
      if (upsertErr) {
        summary.errors.push(
          `${artistSlug} upsert: ${upsertErr.message}`,
        );
        continue;
      }
      summary.snapshotsUpserted += upsertRows.length;

      // ── 3. Fetch yesterday's snapshots for comparison ────────────────
      const { data: prevSnaps } = await admin
        .from("leaderboard_snapshots")
        .select("fan_id, rank")
        .eq("community_slug", artistSlug)
        .eq("snapshot_date", yesterday);

      const prevRankByFan = new Map<string, number>(
        (prevSnaps ?? []).map((r) => [r.fan_id as string, r.rank as number]),
      );

      // ── 4. Fire notifications ────────────────────────────────────────
      for (const entry of leaderboard.top) {
        const { fan_id: fanId, rank: currentRank, score } = entry;
        if (score === 0) continue; // no activity — skip

        const prevRank = prevRankByFan.get(fanId);

        // First place (newly reached today, or held today).
        if (currentRank === 1) {
          // Only notify if they weren't #1 yesterday (avoid daily spam).
          if (prevRank === undefined || prevRank !== 1) {
            await notifyFirstPlace({ fanId, artistName });
            summary.notificationsFirstPlace += 1;
          }
        }
        // Overtaken: rank got worse vs yesterday.
        else if (prevRank !== undefined && currentRank > prevRank) {
          await notifyOvertaken({ fanId, artistName, newRank: currentRank });
          summary.notificationsOvertaken += 1;
        }

        // Month-end nudge (independent of rank change).
        if (sendNudge) {
          await notifyMonthEndNudge({
            fanId,
            artistName,
            rank: currentRank,
            daysLeft,
          });
          summary.notificationsNudge += 1;
        }
      }
    } catch (err) {
      summary.errors.push(
        `${artistSlug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    daysLeftInMonth: daysLeft,
    nudgeFired: sendNudge,
    ...summary,
  });
}
