import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("0108 sms parent consent", () => {
  const sql = readRepo("../../../supabase/migrations/0108_sms_parent_consent.sql");

  it("adds a nullable timestamp and refuses a teen text opt-in without it", () => {
    assert.match(sql, /add column if not exists sms_parent_consent_at timestamptz/);
    assert.match(sql, /sms_parent_consent_required/);
    assert.match(sql, /sms_not_allowed/);
    assert.match(sql, /sms_parent_consent' = 'true'/);
    assert.doesNotMatch(sql, /create table/i);
    assert.doesNotMatch(sql, /drop table/i);
  });

  it("signup and notifications use a separate text checkbox", () => {
    const form = readRepo("../../app/signup/signup-form.tsx");
    const prefs = readRepo("../../app/me/notifications/preferences-form.tsx");
    const gate = readRepo("../age-gate.ts");
    assert.match(form, /name="sms-parent-consent"/);
    assert.match(form, /SMS_GUARDIAN_CHECKBOX/);
    assert.match(prefs, /name="sms-parent-consent"/);
    assert.match(gate, /A parent or guardian says I can get text messages\./);
    assert.match(
      gate,
      /Ages 13 to 17 need a parent or guardian's permission before text messages can be turned on\./,
    );
  });
});
