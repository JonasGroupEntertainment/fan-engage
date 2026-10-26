import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CRON_REQUIRED_ENV,
  MAILCHIMP_ENV,
  VERCEL_CRON_JOBS,
  buildCronLog,
  cronAuthProblem,
  cronRunErrorRow,
  digestRunErrorRow,
  errorTextFromBody,
  finishDetail,
  missingEnvMessage,
  missingEnvVars,
  mondayOfThisWeekUTC,
  optionalEnvWarning,
} from "./cron-observability.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("cronAuthProblem", () => {
  it("names a missing CRON_SECRET and does not run", () => {
    const problem = cronAuthProblem(
      new Request("https://fanengagepro.com/api/cron/weekly-digest"),
      {},
    );
    assert.deepEqual(problem, {
      status: 503,
      error: "CRON_SECRET is not configured",
    });
  });

  it("names a bearer mismatch without echoing the secret or the header", () => {
    const secret = "cron-secret-value-not-for-logs";
    const header = "Bearer attacker-supplied-token";
    const problem = cronAuthProblem(
      new Request("https://fanengagepro.com/api/cron/weekly-digest", {
        headers: { authorization: header },
      }),
      { CRON_SECRET: secret },
    );
    assert.equal(problem?.status, 401);
    assert.match(problem?.error ?? "", /does not match/);
    assert.equal(problem?.error.includes(secret), false);
    assert.equal(problem?.error.includes("attacker-supplied-token"), false);
  });

  it("accepts the matching bearer", () => {
    const secret = "expected-cron-secret";
    const problem = cronAuthProblem(
      new Request("https://fanengagepro.com/api/cron/drops-notifier", {
        headers: { authorization: `Bearer ${secret}` },
      }),
      { CRON_SECRET: secret },
    );
    assert.equal(problem, null);
  });
});

describe("missing env", () => {
  it("lists blank Mailchimp vars by name", () => {
    const missing = missingEnvVars(MAILCHIMP_ENV, {
      MAILCHIMP_API_KEY: " ",
      MAILCHIMP_SERVER_PREFIX: "",
    });
    assert.deepEqual(missing, [
      "MAILCHIMP_API_KEY",
      "MAILCHIMP_SERVER_PREFIX",
      "MAILCHIMP_AUDIENCE_ID",
    ]);
    assert.equal(
      missingEnvMessage(missing),
      "Missing env: MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_AUDIENCE_ID",
    );
  });

  it("requires Mailchimp for the digest and push keys are a notifier warning", () => {
    assert.deepEqual(CRON_REQUIRED_ENV["weekly-digest"], [...MAILCHIMP_ENV]);
    assert.equal(
      optionalEnvWarning("drops-notifier", {}),
      "Missing env: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY",
    );
    assert.equal(
      optionalEnvWarning("drops-notifier", {
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
      }),
      null,
    );
    assert.match(
      optionalEnvWarning("send-event-reminders", {
        MAILCHIMP_API_KEY: "k",
        MAILCHIMP_SERVER_PREFIX: "us1",
        MAILCHIMP_AUDIENCE_ID: "aud",
      }) ?? "",
      /TWILIO_ACCOUNT_SID/,
    );
  });
});

describe("cron log rows", () => {
  const now = new Date("2026-10-22T18:00:00.000Z");

  it("builds a structured console.error payload", () => {
    assert.deepEqual(
      buildCronLog({
        job: "weekly-digest",
        event: "failure",
        error: "CRON_SECRET is not configured",
        status: 503,
        at: now.toISOString(),
      }),
      {
        source: "cron",
        job: "weekly-digest",
        event: "failure",
        at: "2026-10-22T18:00:00.000Z",
        error: "CRON_SECRET is not configured",
        status: 503,
      },
    );
  });

  it("writes a digest_log error with the text and a null fan for a run-level failure", () => {
    assert.deepEqual(
      digestRunErrorRow({
        error: "Missing env: MAILCHIMP_API_KEY",
        weekStart: mondayOfThisWeekUTC(now),
        now,
      }),
      {
        fan_id: null,
        week_start: "2026-10-19",
        sent_at: "2026-10-22T18:00:00.000Z",
        status: "error",
        error_message: "Missing env: MAILCHIMP_API_KEY",
        mailchimp_campaign_id: null,
        html_body: null,
        text_body: null,
        ai_summary_count: null,
        payload_communities: null,
        payload_post_ids: null,
      },
    );
  });

  it("writes cron_runs for the other jobs", () => {
    const row = cronRunErrorRow({
      job: "drops-notifier",
      error: "CRON_SECRET rejected: Authorization bearer does not match",
      httpStatus: 401,
      now,
    });
    assert.equal(row.job, "drops-notifier");
    assert.equal(row.status, "error");
    assert.equal(row.http_status, 401);
    assert.match(row.error_message, /bearer does not match/);
  });

  it("pulls campaign and item errors out of a JSON body", () => {
    assert.equal(
      errorTextFromBody({
        ok: false,
        summary: { campaignError: "Mailchimp campaigns POST 401: no" },
      }),
      "Mailchimp campaigns POST 401: no",
    );
    assert.match(
      errorTextFromBody({
        ok: false,
        summary: {
          campaignError: "No fans had merge fields successfully updated; skipping campaign send.",
          errors: [{ fan_id: "fan-1", error: "fan_artist_following: column created_at does not exist" }],
        },
      }) ?? "",
      /fan_artist_following: column created_at does not exist/,
    );
    const already =
      "No fans had merge fields successfully updated; skipping campaign send. fan-1: fan_artist_following: column created_at does not exist";
    assert.equal(
      errorTextFromBody({
        ok: false,
        summary: {
          campaignError: already,
          errors: [{ fan_id: "fan-1", error: "fan_artist_following: column created_at does not exist" }],
        },
      }),
      already,
    );
    assert.equal(
      errorTextFromBody({ ok: true, errors: ["launched: boom"] }),
      "launched: boom",
    );
    assert.equal(errorTextFromBody({ ok: true, errors: [], summary: { errors: [] } }), null);
    assert.equal(finishDetail({ ok: true, summary: { totalCandidates: 0, prepared: 0 } })?.totalCandidates, 0);
  });
});

describe("scheduled routes log through runCron", () => {
  const vercel = JSON.parse(
    readRepo("../vercel.json"),
  ) as { crons: Array<{ path: string }> };

  it("covers every cron in frontend/vercel.json", () => {
    const jobs = vercel.crons.map((cron) => cron.path.replace("/api/cron/", ""));
    assert.deepEqual(jobs, [...VERCEL_CRON_JOBS]);
  });

  it("each route calls runCron with its job name", () => {
    for (const job of VERCEL_CRON_JOBS) {
      const source = readRepo(`../app/api/cron/${job}/route.ts`);
      assert.match(source, new RegExp(`runCron\\(\\s*request,\\s*"${job}"`));
      assert.equal(source.includes("verifyCronAuth"), false);
    }
  });

  it("migration 0082 is manual and not applied", () => {
    const sql = readRepo("../../supabase/migrations/0082_cron_run_log.sql");
    assert.match(sql, /NOT applied/);
    assert.match(sql, /Apply manually/);
    assert.match(sql, /alter table public\.digest_log alter column fan_id drop not null/);
    assert.match(sql, /create table if not exists public\.cron_runs/);
    assert.match(sql, /status = 'error'/);
  });
});
