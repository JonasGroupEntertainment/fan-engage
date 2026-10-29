/**
 * Pure helpers for Vercel cron visibility.
 *
 * Scheduled routes in frontend/vercel.json call runCron(), which:
 *   - logs start, finish, and failure as one JSON object on console.error
 *     (Vercel hides console.log more readily than errors)
 *   - on failure writes digest_log (weekly-digest) or cron_runs (every
 *     other scheduled job)
 *
 * Auth failures and missing env vars are failures. They used to return
 * 401/503, or a 200, with no row and sometimes no log line.
 */

export const DIGEST_JOB = "weekly-digest";

export const MAILCHIMP_ENV = [
  "MAILCHIMP_API_KEY",
  "MAILCHIMP_SERVER_PREFIX",
  "MAILCHIMP_AUDIENCE_ID",
] as const;

export const PUSH_ENV = [
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
] as const;

/**
 * Jobs in frontend/vercel.json. The route test fails if a schedule is
 * added without a matching runCron() call.
 */
export const VERCEL_CRON_JOBS = [
  "send-event-reminders",
  "refresh-monthly-credits",
  "embeddings-backfill",
  "moderation-backfill",
  "weekly-digest",
  "tags-backfill",
  "event-match-prepare",
  "daily-admin-brief",
  "drops-notifier",
  "anniversary-notifier",
  "compute-optimal-hours",
  "thread-summary-backfill",
  "post-drafts",
  "alt-text-backfill",
  "moderation-explain",
  "fraud-scan",
  "leaderboard-notifications",
  "streak-at-risk",
] as const;

export type VercelCronJob = (typeof VERCEL_CRON_JOBS)[number];

/**
 * Missing any of these aborts the run with 503 before the handler.
 * Other jobs degrade or only notify on one channel; those are warned
 * (row + console.error) and still run.
 */
export const CRON_REQUIRED_ENV: Partial<Record<VercelCronJob, readonly string[]>> = {
  "weekly-digest": MAILCHIMP_ENV,
  "embeddings-backfill": ["OPENAI_API_KEY"],
  "moderation-backfill": ["ANTHROPIC_API_KEY"],
  "tags-backfill": ["ANTHROPIC_API_KEY"],
  "alt-text-backfill": ["ANTHROPIC_API_KEY"],
  "post-drafts": ["ANTHROPIC_API_KEY"],
  "thread-summary-backfill": ["ANTHROPIC_API_KEY"],
};

const NOTIFIER_JOBS = new Set<VercelCronJob>([
  "drops-notifier",
  "anniversary-notifier",
  "leaderboard-notifications",
  "streak-at-risk",
]);

export type CronLogEventName = "start" | "finish" | "failure";

export interface CronLogEvent {
  source: "cron";
  job: string;
  event: CronLogEventName;
  at: string;
  error?: string;
  status?: number;
  missingEnv?: string[];
  detail?: Record<string, unknown>;
}

export interface CronAuthProblem {
  status: 401 | 503;
  error: string;
}

const ERROR_TEXT_MAX = 2000;

export function missingEnvVars(
  names: readonly string[],
  env: Record<string, string | undefined> = process.env,
): string[] {
  return names.filter((name) => {
    const value = env[name];
    return value == null || value.trim() === "";
  });
}

export function missingEnvMessage(missing: readonly string[]): string {
  return `Missing env: ${missing.join(", ")}`;
}

/**
 * Fails closed. A missing CRON_SECRET is a 503 (do not run the job
 * unauthenticated). A present secret that does not match the bearer
 * is a 401. The error text names the cause and never includes the
 * secret or the caller’s header.
 */
export function cronAuthProblem(
  request: { headers: { get(name: string): string | null } },
  env: Record<string, string | undefined> = process.env,
): CronAuthProblem | null {
  const secret = env.CRON_SECRET;
  if (secret == null || secret.trim() === "") {
    return { status: 503, error: "CRON_SECRET is not configured" };
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return {
      status: 401,
      error: "CRON_SECRET rejected: Authorization bearer does not match",
    };
  }
  return null;
}

/**
 * Channels a notifier can run without. Logged and stored, and the
 * handler still runs (anniversary points, SMS, snapshot writes).
 * Mailchimp for the digest is required, not a warning — see
 * CRON_REQUIRED_ENV.
 */
export function optionalEnvWarning(
  job: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (NOTIFIER_JOBS.has(job as VercelCronJob)) {
    const missing = missingEnvVars(PUSH_ENV, env);
    return missing.length > 0 ? missingEnvMessage(missing) : null;
  }
  if (job === "fraud-scan") {
    const missing = missingEnvVars(["ANTHROPIC_API_KEY"], env);
    return missing.length > 0 ? missingEnvMessage(missing) : null;
  }
  if (job === "send-event-reminders") {
    const parts: string[] = [];
    const mailchimp = missingEnvVars(MAILCHIMP_ENV, env);
    if (mailchimp.length > 0) parts.push(missingEnvMessage(mailchimp));
    const twilio = twilioEnvWarning(env);
    if (twilio) parts.push(twilio);
    return parts.length > 0 ? parts.join("; ") : null;
  }
  return null;
}

function twilioEnvWarning(env: Record<string, string | undefined>): string | null {
  const missing = missingEnvVars(
    ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    env,
  );
  const hasFrom = Boolean(
    env.TWILIO_MESSAGING_SERVICE_SID?.trim() || env.TWILIO_DEFAULT_FROM?.trim(),
  );
  if (missing.length === 0 && hasFrom) return null;
  const names = [...missing];
  if (!hasFrom) names.push("TWILIO_MESSAGING_SERVICE_SID or TWILIO_DEFAULT_FROM");
  return missingEnvMessage(names);
}

export function buildCronLog(
  input: {
    job: string;
    event: CronLogEventName;
    error?: string;
    status?: number;
    missingEnv?: string[];
    detail?: Record<string, unknown>;
    at?: string;
  },
): CronLogEvent {
  const event: CronLogEvent = {
    source: "cron",
    job: input.job,
    event: input.event,
    at: input.at ?? new Date().toISOString(),
  };
  if (input.error) event.error = clip(input.error);
  if (typeof input.status === "number") event.status = input.status;
  if (input.missingEnv && input.missingEnv.length > 0) {
    event.missingEnv = [...input.missingEnv];
  }
  if (input.detail && Object.keys(input.detail).length > 0) {
    event.detail = input.detail;
  }
  return event;
}

export function emitCronLog(event: CronLogEvent): void {
  console.error(JSON.stringify(event));
}

export function mondayOfThisWeekUTC(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

/** Run-level digest failure. fan_id is null until a fan is in hand. */
export function digestRunErrorRow(input: {
  error: string;
  weekStart: string;
  now?: Date;
  fanId?: string | null;
}) {
  return {
    fan_id: input.fanId ?? null,
    week_start: input.weekStart,
    sent_at: (input.now ?? new Date()).toISOString(),
    status: "error" as const,
    error_message: clip(input.error),
    mailchimp_campaign_id: null,
    html_body: null,
    text_body: null,
    ai_summary_count: null,
    payload_communities: null,
    payload_post_ids: null,
  };
}

export function cronRunErrorRow(input: {
  job: string;
  error: string;
  httpStatus?: number;
  missingEnv?: string[];
  now?: Date;
}) {
  return {
    job: input.job,
    status: "error" as const,
    error_message: clip(input.error),
    http_status: input.httpStatus ?? null,
    detail: input.missingEnv && input.missingEnv.length > 0
      ? { missingEnv: [...input.missingEnv] }
      : null,
    finished_at: (input.now ?? new Date()).toISOString(),
  };
}

export function errorTextFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const error = typeof record.error === "string" ? record.error : "";
  const detail = typeof record.detail === "string" ? record.detail : "";
  if (error && detail && detail !== error) return clip(`${error}: ${detail}`);
  if (error) return clip(error);

  const listed = listedErrors(record.errors);
  if (listed) return listed;

  const summary = record.summary;
  if (summary && typeof summary === "object") {
    const s = summary as Record<string, unknown>;
    if (typeof s.campaignError === "string" && s.campaignError.trim()) {
      const summaryErrors = listedErrors(s.errors);
      if (
        summaryErrors &&
        !campaignErrorAlreadyLists(s.campaignError, s.errors)
      ) {
        return clip(`${s.campaignError} ${summaryErrors}`);
      }
      return clip(s.campaignError);
    }
    const summaryErrors = listedErrors(s.errors);
    if (summaryErrors) return summaryErrors;
  }
  if (typeof record.errors === "number" && record.errors > 0) {
    return `${record.errors} item error(s)`;
  }
  if (typeof record.failed === "number" && record.failed > 0) {
    return `${record.failed} item error(s)`;
  }
  if (record.ok === false) return "cron reported ok:false";
  return null;
}

/** Compact fields for the finish line. No HTML, no fan list. */
export function finishDetail(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const detail: Record<string, unknown> = {};
  if (typeof record.ok === "boolean") detail.ok = record.ok;
  if (typeof record.processed === "number") detail.processed = record.processed;
  if (typeof record.scanned === "number") detail.scanned = record.scanned;
  if (typeof record.errors === "number") detail.errors = record.errors;
  const summary = record.summary;
  if (summary && typeof summary === "object") {
    const s = summary as Record<string, unknown>;
    if (typeof s.totalCandidates === "number") detail.totalCandidates = s.totalCandidates;
    if (typeof s.prepared === "number") detail.prepared = s.prepared;
    if (typeof s.skipped === "number") detail.skipped = s.skipped;
    if (typeof s.campaignError === "string" && s.campaignError) {
      detail.campaignError = clip(s.campaignError);
    }
    if (Array.isArray(s.errors)) detail.errorCount = s.errors.length;
    if (Array.isArray(s.skippedOrphans)) {
      detail.skippedOrphans = s.skippedOrphans.length;
    }
  }
  if (Array.isArray(record.errors)) detail.errorCount = record.errors.length;
  return Object.keys(detail).length > 0 ? detail : undefined;
}

/** True when each per-fan error string is already inside campaignError. */
function campaignErrorAlreadyLists(campaignError: string, errors: unknown): boolean {
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.every((entry) => {
    if (!entry || typeof entry !== "object" || !("error" in entry)) return false;
    const err = (entry as { error?: unknown }).error;
    if (typeof err !== "string") return false;
    const probe = err.replace(/\s+/g, " ").trim().slice(0, 40);
    return probe.length > 0 && campaignError.includes(probe);
  });
}

function listedErrors(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const text = value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "error" in entry) {
        const err = (entry as { error?: unknown }).error;
        return typeof err === "string" ? err : JSON.stringify(entry);
      }
      return JSON.stringify(entry);
    })
    .join("; ");
  return clip(text);
}

function clip(text: string): string {
  return text.length <= ERROR_TEXT_MAX ? text : `${text.slice(0, ERROR_TEXT_MAX - 1)}…`;
}
