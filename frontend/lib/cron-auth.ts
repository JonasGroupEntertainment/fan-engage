import { NextResponse } from "next/server";
import {
  buildCronLog,
  cronAuthProblem,
  emitCronLog,
} from "@/lib/cron-observability";

/**
 * Shared cron authentication helper.
 *
 * Returns a NextResponse error if auth fails, or null if the request is
 * authorized. Fails CLOSED: if CRON_SECRET is missing from env (e.g. an
 * accidental redeploy without the var set) we return 503 rather than
 * letting the job run unauthenticated.
 *
 * Usage (routes that are not on the Vercel cron schedule):
 *   const authErr = verifyCronAuth(request, "payout-artists");
 *   if (authErr) return authErr;
 *
 * Scheduled routes use runCron() in lib/cron-run.ts, which also writes
 * a digest_log or cron_runs row.
 */
export function verifyCronAuth(
  request: Request,
  job = "cron",
): NextResponse | null {
  const problem = cronAuthProblem(request);
  if (!problem) return null;
  emitCronLog(
    buildCronLog({
      job,
      event: "failure",
      error: problem.error,
      status: problem.status,
    }),
  );
  return NextResponse.json(
    { ok: false, error: problem.error },
    { status: problem.status },
  );
}
