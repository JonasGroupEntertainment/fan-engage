import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { smsEnabledFromOnboarding } from "./sms-send-gate.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("onboarding SMS opt-in turns on the SMS channel", () => {
  it("enables SMS only when the fan opted in and gave a phone", () => {
    assert.equal(smsEnabledFromOnboarding(true, "+16155550123"), true);
    assert.equal(smsEnabledFromOnboarding(true, null), false);
    assert.equal(smsEnabledFromOnboarding(true, "   "), false);
    assert.equal(smsEnabledFromOnboarding(false, "+16155550123"), false);
    assert.equal(smsEnabledFromOnboarding(undefined, "+16155550123"), false);
  });

  it("onboard route writes sms_enabled to notification_preferences", () => {
    const src = readRepo("../app/api/fan-engage/onboard/route.ts");
    assert.match(src, /setPreferences\(user\.id,\s*\{\s*sms_enabled:\s*smsEnabledFromOnboarding\(/);
  });
});

describe("leaderboard notifications cron is scheduled", () => {
  it("vercel.json runs /api/cron/leaderboard-notifications once a day", () => {
    const config = JSON.parse(readRepo("../vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const entry = config.crons.find((c) => c.path === "/api/cron/leaderboard-notifications");
    assert.ok(entry, "leaderboard-notifications cron missing");
    assert.match(entry.schedule, /^\d+ \d+ \* \* \*$/);
  });
});
