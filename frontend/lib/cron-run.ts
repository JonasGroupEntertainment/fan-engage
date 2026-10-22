import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CRON_REQUIRED_ENV,
  DIGEST_JOB,
  buildCronLog,
  cronAuthProblem,
  cronRunErrorRow,
  digestRunErrorRow,
  emitCronLog,
  errorTextFromBody,
  finishDetail,
  missingEnvMessage,
  missingEnvVars,
  mondayOfThisWeekUTC,
  optionalEnvWarning,
  type VercelCronJob,
} from "@/lib/cron-observability";

/**
 * Wrap a scheduled cron handler.
 *
 * @sentry/nextjs is not installed in this app, so failures are not sent
 * to Sentry. They go to console.error and to digest_log / cron_runs.
 */
export async function runCron(
  request: Request,
  job: VercelCronJob,
  work: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const auth = cronAuthProblem(request);
  if (auth) {
    await persistCronFailure(job, auth.error, { httpStatus: auth.status });
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  const required = CRON_REQUIRED_ENV[job] ?? [];
  const missing = missingEnvVars(required);
  if (missing.length > 0) {
    const error = missingEnvMessage(missing);
    await persistCronFailure(job, error, { httpStatus: 503, missingEnv: missing });
    return NextResponse.json(
      { ok: false, error, missingEnv: missing },
      { status: 503 },
    );
  }

  const warning = optionalEnvWarning(job);
  if (warning) {
    await persistCronFailure(job, warning, { httpStatus: 200 });
  }

  emitCronLog(buildCronLog({ job, event: "start" }));
  const started = Date.now();

  let response: NextResponse;
  try {
    response = await work();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await persistCronFailure(job, error, { httpStatus: 500 });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  const failure = await failureFromResponse(response);
  if (failure) {
    await persistCronFailure(job, failure, {
      httpStatus: response.status >= 400 ? response.status : 500,
    });
    return response;
  }

  let detail: Record<string, unknown> | undefined;
  try {
    detail = finishDetail(await response.clone().json());
  } catch {
    detail = undefined;
  }
  emitCronLog(
    buildCronLog({
      job,
      event: "finish",
      status: response.status,
      detail: { ...detail, durationMs: Date.now() - started },
    }),
  );
  return response;
}

async function failureFromResponse(response: Response): Promise<string | null> {
  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    body = null;
  }
  if (response.status >= 400) {
    return errorTextFromBody(body) ?? `HTTP ${response.status}`;
  }
  return errorTextFromBody(body);
}

/**
 * Best-effort row. A missing table (migration 0082 not applied yet) or a
 * missing service-role key must not hide the console.error line, and must
 * not turn a logged auth failure into an unhandled exception.
 */
export async function persistCronFailure(
  job: string,
  error: string,
  extra?: { httpStatus?: number; missingEnv?: string[] },
): Promise<void> {
  emitCronLog(
    buildCronLog({
      job,
      event: "failure",
      error,
      status: extra?.httpStatus,
      missingEnv: extra?.missingEnv,
    }),
  );

  try {
    const admin = createAdminClient();
    if (job === DIGEST_JOB) {
      const { error: dbErr } = await admin.from("digest_log").insert(
        digestRunErrorRow({
          error,
          weekStart: mondayOfThisWeekUTC(),
        }),
      );
      if (dbErr) {
        emitCronLog(
          buildCronLog({
            job,
            event: "failure",
            error: `digest_log insert failed: ${dbErr.message}`,
          }),
        );
      }
      return;
    }

    const { error: dbErr } = await admin.from("cron_runs").insert(
      cronRunErrorRow({
        job,
        error,
        httpStatus: extra?.httpStatus,
        missingEnv: extra?.missingEnv,
      }),
    );
    if (dbErr) {
      emitCronLog(
        buildCronLog({
          job,
          event: "failure",
          error: `cron_runs insert failed: ${dbErr.message}`,
        }),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitCronLog(
      buildCronLog({
        job,
        event: "failure",
        error: `cron failure row was not written: ${message}`,
      }),
    );
  }
}
