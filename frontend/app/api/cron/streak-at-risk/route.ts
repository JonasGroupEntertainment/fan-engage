import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthProblem } from "@/lib/cron-observability";
import { getAdminContext } from "@/lib/admin";
import { pageAll, pageAllIn } from "@/lib/supabase/page-all";
import {
  AT_RISK_MIN_STREAK,
  SEND_UTC_HOUR,
  STREAK_AT_RISK_TYPE,
  isSendHourUtc,
  selectAtRiskFans,
  sentTodayIds,
  utcYesterdayString,
  type AtRiskFan,
  type AtRiskFanRow,
} from "@/lib/streaks/at-risk";
import { notifyStreakAtRisk } from "@/lib/notifications/triggers/streak-at-risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/cron/streak-at-risk
 *
 * Hourly (vercel.json "0 * * * *"); acts only in the 21:00 UTC hour and
 * no-ops the other 23. Pushes "Your N-day streak ends tonight at <local
 * time>" to fans with a streak of 3+ days whose last_active_date is
 * yesterday on the UTC calendar — the calendar lib/streaks/touch.ts keeps,
 * so the streak really is lost at the next 00:00 UTC. The local time in
 * the copy is that moment in notification_preferences.timezone (default
 * America/Chicago). Pure selection: lib/streaks/at-risk.ts.
 *
 * Reads (every one paged past PostgREST's 1,000-row cap):
 *   fans                      id, email, current_streak_days, last_active_date
 *                             where current_streak_days >= 3,
 *                             last_active_date = UTC yesterday, not suspended
 *   notification_preferences  fan_id, timezone        (for those fans, 200 ids per .in())
 *   notification_log          fan_id, sent_at         (type streak_at_risk, last 24h, same)
 *
 * The push goes through sendNotification (push_enabled, notify_streak,
 * quiet hours), which writes the notification_log row that dedups the
 * fan for the rest of the UTC day.
 *
 * ?testEmail=<email>   restrict to that one fan (smoke test; the fan must
 *                      still be at risk and it must be the send hour)
 * ?dryRun=1            counts + up to 10 sample fan ids, nothing sent or
 *                      recorded; cron auth, or a signed-in super-admin.
 *                      Outside the send hour it reports the at-risk set
 *                      with wouldNotify = 0 and sendHour = false.
 */

/** Safety cap per run. */
const MAX_PER_RUN = 2000;

interface RunSummary {
  utcHour: number;
  sendHour: boolean;
  sendHourUtc: number;
  candidates: number;
  atRiskNow: number;
  alreadySentToday: number;
  notified: number;
  timezones: string[];
  sample?: string[];
  errors: string[];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("dryRun") === "1") {
    const authProblem = cronAuthProblem(request);
    if (authProblem) {
      const ctx = await getAdminContext();
      if (!ctx?.isSuperAdmin) {
        return NextResponse.json(
          { ok: false, error: authProblem.error },
          { status: authProblem.status },
        );
      }
    }
    return streakAtRisk(url, true);
  }
  return runCron(request, "streak-at-risk", () => streakAtRisk(url, false));
}

async function streakAtRisk(url: URL, dryRun: boolean) {
  const admin = createAdminClient();
  const now = new Date();
  const testEmail = url.searchParams.get("testEmail")?.trim().toLowerCase() || null;
  const sendHour = isSendHourUtc(now);

  const summary: RunSummary = {
    utcHour: now.getUTCHours(),
    sendHour,
    sendHourUtc: SEND_UTC_HOUR,
    candidates: 0,
    atRiskNow: 0,
    alreadySentToday: 0,
    notified: 0,
    timezones: [],
    errors: [],
  };

  // 23 of 24 runs: nothing to do, and no reads either.
  if (!sendHour && !dryRun) {
    return NextResponse.json({ ok: true, skipped: "not the send hour", summary, ranAt: now.toISOString() });
  }

  try {
    // 1. Fans with something to lose, last counted yesterday (UTC).
    const yesterday = utcYesterdayString(now);
    const fansRes = await pageAll(() => {
      let q = admin
        .from("fans")
        .select("id, email, current_streak_days, last_active_date")
        .gte("current_streak_days", AT_RISK_MIN_STREAK)
        .eq("last_active_date", yesterday)
        .eq("suspended", false)
        .order("id", { ascending: true });
      if (testEmail) q = q.eq("email", testEmail);
      return q;
    });
    if (fansRes.error) {
      return NextResponse.json({ ok: false, error: `fans: ${fansRes.error.message}` }, { status: 500 });
    }
    const fanRows = fansRes.data as Array<{
      id: string;
      email: string | null;
      current_streak_days: number | null;
      last_active_date: string | null;
    }>;
    summary.candidates = fanRows.length;
    if (fanRows.length === 0) {
      return NextResponse.json({ ok: true, dryRun, summary, ranAt: now.toISOString() });
    }

    // 2. Timezones + today's sends, for exactly these fans (chunked .in()).
    const ids = fanRows.map((f) => f.id);
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [prefsRes, logRes] = await Promise.all([
      pageAllIn(ids, (part) =>
        admin
          .from("notification_preferences")
          .select("fan_id, timezone")
          .in("fan_id", part)
          .order("fan_id", { ascending: true }),
      ),
      pageAllIn(ids, (part) =>
        admin
          .from("notification_log")
          .select("fan_id, sent_at")
          .eq("notification_type", STREAK_AT_RISK_TYPE)
          .gte("sent_at", since)
          .in("fan_id", part)
          .order("sent_at", { ascending: true }),
      ),
    ]);
    if (prefsRes.error) {
      return NextResponse.json(
        { ok: false, error: `notification_preferences: ${prefsRes.error.message}` },
        { status: 500 },
      );
    }
    if (logRes.error) {
      return NextResponse.json(
        { ok: false, error: `notification_log: ${logRes.error.message}` },
        { status: 500 },
      );
    }
    const tzByFan = new Map<string, string | null>();
    for (const p of prefsRes.data as Array<{ fan_id: string; timezone: string | null }>) {
      tzByFan.set(p.fan_id, p.timezone);
    }
    const sentToday = sentTodayIds(
      logRes.data as Array<{ fan_id: string; sent_at: string | null }>,
      now,
    );

    // 3. Pure selection (re-checks the hour; a dry run outside it sees 0).
    const rows: AtRiskFanRow[] = fanRows.map((f) => ({ ...f, timezone: tzByFan.get(f.id) ?? null }));
    const atRisk = selectAtRiskFans(rows, now);
    summary.atRiskNow = atRisk.length;
    summary.timezones = Array.from(new Set(atRisk.map((f) => f.timezone))).sort();

    const toNotify: AtRiskFan[] = [];
    for (const f of atRisk) {
      if (sentToday.has(f.id)) {
        summary.alreadySentToday += 1;
        continue;
      }
      toNotify.push(f);
    }

    if (dryRun) {
      summary.sample = toNotify.slice(0, 10).map((f) => f.id);
      return NextResponse.json({
        ok: true,
        dryRun: true,
        summary: { ...summary, wouldNotify: toNotify.length },
        ranAt: now.toISOString(),
      });
    }

    // 4. Push. sendNotification never throws and writes the log row.
    for (const f of toNotify.slice(0, MAX_PER_RUN)) {
      try {
        await notifyStreakAtRisk({
          fanId: f.id,
          currentStreakDays: f.currentStreakDays,
          endsAtLocal: f.endsAtLocal,
        });
        summary.notified += 1;
      } catch (err) {
        summary.errors.push(`${f.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      ok: summary.errors.length === 0,
      testEmail: testEmail ?? undefined,
      summary,
      ranAt: now.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), partial: summary },
      { status: 500 },
    );
  }
}
