import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SMS_PRIVACY_NO_SHARE_SENTENCE } from "./legal/scrub-privacy-policy.ts";
import {
  channelOptInTimestampPatch,
  isMissingOptInTimestampColumn,
  omitOptInTimestamps,
  persistSignupChannelOptIn,
  signupChannelUpdate,
} from "./channel-opt-in.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const NOW = new Date("2026-10-09T00:00:00.000Z");
const ISO = "2026-10-09T00:00:00.000Z";

describe("channelOptInTimestampPatch", () => {
  it("stamps a channel only when consent flips from false to true", () => {
    assert.deepEqual(
      channelOptInTimestampPatch(
        { smsOptedIn: false, emailOptedIn: false },
        { smsOptedIn: true, emailOptedIn: true },
        NOW,
      ),
      { sms_opted_in_at: ISO, email_opted_in_at: ISO },
    );
  });

  it("leaves the timestamp alone when consent stays true or turns off", () => {
    assert.deepEqual(
      channelOptInTimestampPatch(
        { smsOptedIn: true, emailOptedIn: true },
        { smsOptedIn: true, emailOptedIn: false },
        NOW,
      ),
      {},
    );
    assert.deepEqual(
      channelOptInTimestampPatch(
        { smsOptedIn: false, emailOptedIn: true },
        { smsOptedIn: false, emailOptedIn: true },
        NOW,
      ),
      {},
    );
  });
});

describe("signup channel update", () => {
  it("skips the write when phone and SMS are both absent", () => {
    assert.equal(signupChannelUpdate({ phone: null, smsOptedIn: false }, NOW), null);
    assert.equal(signupChannelUpdate({ phone: null, smsOptedIn: true }, NOW), null);
  });

  it("stores a phone without opting in, and stamps SMS only with both", () => {
    assert.deepEqual(signupChannelUpdate({ phone: "+16155550123", smsOptedIn: false }, NOW), {
      phone: "+16155550123",
      sms_opted_in: false,
    });
    assert.deepEqual(signupChannelUpdate({ phone: "+16155550123", smsOptedIn: true }, NOW), {
      phone: "+16155550123",
      sms_opted_in: true,
      sms_opted_in_at: ISO,
    });
  });

  it("retries without the timestamp columns when they are not migrated yet", async () => {
    const calls: Record<string, unknown>[] = [];
    const supabase = {
      from() {
        return {
          update(values: Record<string, unknown>) {
            calls.push(values);
            return {
              eq() {
                return Promise.resolve({
                  error: calls.length === 1
                    ? { code: "PGRST204", message: "Could not find the 'sms_opted_in_at' column of 'fans'" }
                    : null,
                });
              },
            };
          },
        };
      },
    };
    const result = await persistSignupChannelOptIn(
      supabase,
      "fan-1",
      { phone: "+16155550123", smsOptedIn: true },
      NOW,
    );
    assert.deepEqual(result, { saved: true });
    assert.equal(calls.length, 2);
    assert.equal("sms_opted_in_at" in calls[0], true);
    assert.deepEqual(calls[1], { phone: "+16155550123", sms_opted_in: true });
    assert.equal(
      isMissingOptInTimestampColumn({ message: "column sms_opted_in_at does not exist" }),
      true,
    );
    assert.equal(isMissingOptInTimestampColumn({ message: "permission denied" }), false);
    assert.deepEqual(omitOptInTimestamps(calls[0]), calls[1]);
  });
});

describe("channel opt-in migrations", () => {
  it("0068 adds both timestamps, keeps the flags, and does not clear them on opt-out", () => {
    const sql = readRepo("../../supabase/migrations/0068_channel_opt_in_timestamps.sql");
    assert.match(sql, /Not yet applied to production/);
    assert.match(sql, /add column if not exists sms_opted_in_at timestamptz/);
    assert.match(sql, /add column if not exists email_opted_in_at timestamptz/);
    assert.match(sql, /fans\.sms_opted_in and fans\.email_opted_in flags stay/);
    assert.match(sql, /Opt-out does not clear sms_opted_in_at/);
    assert.match(sql, /Opt-out does not clear email_opted_in_at/);
    assert.doesNotMatch(sql, /sms_opted_in_at\s*:=\s*null/);
    assert.doesNotMatch(sql, /email_opted_in_at\s*:=\s*null/);
    assert.match(sql, /meta->>'sms_opted_in' = 'true'/);
    assert.match(sql, /phone_text is null or phone_text !~/);
  });

  it("onboard stamps timestamps from the previous flags and still writes the booleans", () => {
    const route = readRepo("../app/api/fan-engage/onboard/route.ts");
    assert.match(route, /sms_opted_in: consent\.smsOptedIn/);
    assert.match(route, /channelOptInTimestampPatch\(/);
    assert.match(route, /isMissingOptInTimestampColumn\(updateErr\)/);
    assert.match(route, /omitOptInTimestamps\(updates\)/);
  });

  it("0069 updates privacy only and includes the no-share sentence", () => {
    const sql = readRepo("../../supabase/migrations/0069_privacy_sms_no_share.sql");
    assert.match(sql, /Not yet applied to production/);
    assert.match(sql, /where slug = 'privacy'/);
    assert.equal(sql.includes(SMS_PRIVACY_NO_SHARE_SENTENCE), true);
    assert.match(sql, /sign up for our text\\s\+messages;/);
    assert.doesNotMatch(sql, /slug = 'terms'/);
  });
});
