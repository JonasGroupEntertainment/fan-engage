import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  resolveSmsSwitch,
  smsEnabledFromOnboarding,
  smsOptInFromSettings,
  smsTierAllowed,
} from "./sms-send-gate.ts";

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

describe("settings SMS switch syncs fans.sms_opted_in", () => {
  it("records consent only for an allowed tier with a phone", () => {
    assert.equal(smsOptInFromSettings(true, true, "+16155550123"), true);
    assert.equal(smsOptInFromSettings(true, true, null), null);
    assert.equal(smsOptInFromSettings(true, true, "  "), null);
  });

  it("never revokes consent when the tier gate blocks the switch", () => {
    assert.equal(smsOptInFromSettings(true, false, "+16155550123"), null);
  });

  it("revokes consent when the fan turns SMS off", () => {
    assert.equal(smsOptInFromSettings(false, true, "+16155550123"), false);
    assert.equal(smsOptInFromSettings(false, false, null), false);
  });

  it("leaves consent alone when the patch has no SMS change", () => {
    assert.equal(smsOptInFromSettings(undefined, true, "+16155550123"), null);
  });

  it("notifications action writes sms_opted_in only when the switch changes", () => {
    const src = readRepo("../app/me/notifications/actions.ts");
    assert.match(src, /resolveSmsSwitch\(/);
    assert.match(src, /sms\.changed\s*\?\s*smsOptInFromSettings\(/);
    assert.match(src, /\.update\(\{\s*sms_opted_in:\s*smsOptIn\s*\}\)/);
  });
});

describe("SMS switch on the notifications page", () => {
  it("allows SMS at Gold and up only", () => {
    assert.equal(smsTierAllowed("bronze"), false);
    assert.equal(smsTierAllowed("silver"), false);
    assert.equal(smsTierAllowed(null), false);
    assert.equal(smsTierAllowed("gold"), true);
    assert.equal(smsTierAllowed("platinum"), true);
    assert.equal(smsTierAllowed("founder"), true);
  });

  it("Silver cannot turn SMS on", () => {
    assert.deepEqual(resolveSmsSwitch(true, false, false), { smsEnabled: false, changed: false });
  });

  it("Silver keeps a stored SMS on and can turn it off", () => {
    assert.deepEqual(resolveSmsSwitch(true, true, false), { smsEnabled: true, changed: false });
    assert.deepEqual(resolveSmsSwitch(false, true, false), { smsEnabled: false, changed: true });
  });

  it("Gold toggles freely and reports no change when unchanged", () => {
    assert.deepEqual(resolveSmsSwitch(true, false, true), { smsEnabled: true, changed: true });
    assert.deepEqual(resolveSmsSwitch(false, true, true), { smsEnabled: false, changed: true });
    assert.deepEqual(resolveSmsSwitch(true, true, true), { smsEnabled: true, changed: false });
  });

  it("old settings page redirects to /me/notifications", () => {
    const src = readRepo("../app/settings/notifications/page.tsx");
    assert.match(src, /redirect\("\/me\/notifications"\)/);
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
