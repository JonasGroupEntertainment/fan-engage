import { NextResponse } from "next/server";
import { runCron } from "@/lib/cron-run";
import { cronAuthProblem } from "@/lib/cron-observability";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamBriefDeps } from "@/lib/team-brief/data";
import { runTeamBrief } from "@/lib/team-brief/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-team-brief
 *
 * Scheduled via vercel.json Mondays 13:00 UTC (8 AM EST / 9 AM EDT). For
 * every active artist with a portal team (admin_users rows on the
 * community), emails each team member last week's numbers — new
 * followers, posts (fans vs team), comments, reactions, check-ins, RSVPs,
 * redemptions, points, top fans, superfans to thank, upcoming events and
 * pending AI drafts — rendered by lib/team-brief/render.ts. Delivery is
 * lib/email/transactional.ts (Mandrill when MANDRILL_API_KEY is set, else
 * Mailchimp merge-field + segment + campaign). One brief per artist per
 * ISO week, deduped on notification_log (notification_type 'team_brief',
 * metadata.week_start).
 *
 * ?dryRun=1 — cron-authed, or a signed-in super-admin — renders every
 * brief and returns per-artist recipient counts + subjects. Sends and
 * records nothing (not even a cron_runs row), so it bypasses runCron.
 * ?testEmail=<email> — a real run that sends only to that address.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("dryRun") === "1") {
    return dryRun(request, url);
  }
  return runCron(request, "weekly-team-brief", () => weeklyTeamBrief(url));
}

async function dryRun(request: Request, url: URL) {
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
  try {
    const result = await runTeamBrief({
      deps: teamBriefDeps(createAdminClient()),
      dryRun: true,
      testEmail: url.searchParams.get("testEmail"),
    });
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, dryRun: true, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function weeklyTeamBrief(url: URL) {
  const started = Date.now();
  const result = await runTeamBrief({
    deps: teamBriefDeps(createAdminClient()),
    dryRun: false,
    testEmail: url.searchParams.get("testEmail"),
  });
  // runCron reads `error` / `failed` to decide whether this run failed;
  // a provider-level error or a failed insert is a failure, a few
  // bounced members are reported but do not fail the run.
  return NextResponse.json({
    ok: result.error == null,
    ...(result.error ? { error: result.error } : {}),
    provider: result.provider,
    weekStart: result.weekStart,
    period: result.period,
    processed: result.sent,
    sent: result.sent,
    failedSends: result.failed,
    skipped: result.skipped,
    campaignId: result.campaignId,
    artists: result.artists,
    took_ms: Date.now() - started,
  });
}
