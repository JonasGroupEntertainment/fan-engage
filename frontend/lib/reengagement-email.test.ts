import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  dueReengagementStep,
  isReengagementEmailEnabled,
  reengagementMessage,
  reengagementStepFor,
} from "./reengagement-email.ts";
import { sendTransactionalEmail } from "./reengagement-send.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const NOW = new Date("2026-10-12T15:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function createdDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

function candidate(overrides: Partial<Parameters<typeof dueReengagementStep>[0]> = {}) {
  return {
    createdAt: createdDaysAgo(3),
    emailOptedIn: true,
    suspended: false,
    isInternal: false,
    email: "fan@example.com",
    unsubscribeToken: "tok_abc",
    sentSteps: [],
    ...overrides,
  };
}

describe("re-engagement flag", () => {
  it("is off unless the value is exactly true", () => {
    assert.equal(isReengagementEmailEnabled({}), false);
    assert.equal(isReengagementEmailEnabled({ REENGAGEMENT_EMAIL_ENABLED: "" }), false);
    assert.equal(isReengagementEmailEnabled({ REENGAGEMENT_EMAIL_ENABLED: "false" }), false);
    assert.equal(isReengagementEmailEnabled({ REENGAGEMENT_EMAIL_ENABLED: "1" }), false);
    assert.equal(isReengagementEmailEnabled({ REENGAGEMENT_EMAIL_ENABLED: " true " }), true);
  });
});

describe("re-engagement windows", () => {
  it("sends day 3 in [3, 5) days and day 7 in [7, 9) days", () => {
    assert.equal(reengagementStepFor(new Date(createdDaysAgo(3)), NOW, new Set()), 3);
    assert.equal(reengagementStepFor(new Date(createdDaysAgo(4.9)), NOW, new Set()), 3);
    assert.equal(reengagementStepFor(new Date(createdDaysAgo(5)), NOW, new Set()), null);
    assert.equal(reengagementStepFor(new Date(createdDaysAgo(6)), NOW, new Set()), null);
    assert.equal(reengagementStepFor(new Date(createdDaysAgo(7)), NOW, new Set()), 7);
    assert.equal(reengagementStepFor(new Date(createdDaysAgo(8.9)), NOW, new Set()), 7);
    assert.equal(reengagementStepFor(new Date(createdDaysAgo(9)), NOW, new Set()), null);
  });

  it("does not send a step twice and skips people who should not be emailed", () => {
    assert.equal(dueReengagementStep(candidate({ sentSteps: [3] }), NOW), null);
    assert.equal(
      dueReengagementStep(candidate({ createdAt: createdDaysAgo(8), sentSteps: [3] }), NOW),
      7,
    );
    assert.equal(dueReengagementStep(candidate({ isInternal: true }), NOW), null);
    assert.equal(dueReengagementStep(candidate({ emailOptedIn: false }), NOW), null);
    assert.equal(dueReengagementStep(candidate({ suspended: true }), NOW), null);
    assert.equal(dueReengagementStep(candidate({ unsubscribeToken: null }), NOW), null);
    assert.equal(dueReengagementStep(candidate({ email: "  " }), NOW), null);
  });
});

describe("re-engagement message", () => {
  it("includes an unsubscribe link and does not echo a token into the subject", () => {
    const message = reengagementMessage({
      step: 3,
      firstName: "Ada <script>",
      appUrl: "https://www.fanengagepro.com",
      unsubscribeToken: "tok_secret",
    });
    assert.match(message.text, /unsubscribe/i);
    assert.match(message.html, /unsubscribe\?token=tok_secret/);
    assert.equal(message.html.includes("<script>"), false);
    assert.match(message.html, /Ada &lt;script&gt;/);
    assert.equal(message.subject.includes("tok_secret"), false);
    assert.match(reengagementMessage({
      step: 7,
      firstName: null,
      appUrl: "https://www.fanengagepro.com/",
      unsubscribeToken: "tok",
    }).subject, /week/i);
  });
});

describe("transactional send", () => {
  it("does not log the recipient or the api key", async () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const result = await sendTransactionalEmail({
        apiKey: "md-secret-key-value",
        to: "fan@example.com",
        subject: "Hi",
        text: "Hello",
        html: "<p>Hello</p>",
        fetchImpl: async () =>
          new Response(
            JSON.stringify([{ status: "rejected", email: "fan@example.com" }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      });
      assert.equal(result.ok, false);
      const logged = warnings.join("\n");
      assert.equal(logged.includes("fan@example.com"), false);
      assert.equal(logged.includes("md-secret-key-value"), false);
      assert.match(logged, /rejected/);
    } finally {
      console.warn = original;
    }
  });
});

describe("re-engagement wiring", () => {
  it("gates the cron on its own flag and does not touch the broadcast flag", () => {
    const route = readRepo("../app/api/cron/reengagement-email/route.ts");
    const email = readRepo("./reengagement-email.ts");
    const send = readRepo("./reengagement-send.ts");
    const env = readRepo("../.env.example");
    const vercel = readRepo("../vercel.json");
    const migration = readRepo("../../supabase/migrations/0080_fan_reengagement_emails.sql");
    const bundle = [route, email, send, env, vercel, migration].join("\n");

    assert.equal(bundle.includes("MAILCHIMP_BROADCAST_ENABLED"), false);
    assert.doesNotMatch(route, /from "@\/lib\/broadcast"/);
    assert.match(route, /isReengagementEmailEnabled/);
    const body = route.slice(route.indexOf("export async function GET"));
    assert.ok(body.indexOf("isReengagementEmailEnabled") < body.indexOf("testEmail"));
    assert.ok(body.indexOf("isReengagementEmailEnabled") < body.indexOf("MANDRILL_API_KEY"));
    assert.match(vercel, /\/api\/cron\/reengagement-email/);
    assert.match(migration, /fan_reengagement_emails/);
    assert.doesNotMatch(migration, /alter type/i);
    assert.doesNotMatch(migration, /delete from public\.fans/i);
  });
});
