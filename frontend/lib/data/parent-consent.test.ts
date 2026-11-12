import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("0098 parent consent", () => {
  const sql = readRepo("../../../supabase/migrations/0098_parent_consent.sql");

  it("adds a timestamp column and refuses a teen signup without the checkbox", () => {
    assert.match(sql, /add column if not exists parent_consent_at timestamptz/);
    assert.match(sql, /parent_consent_required/);
    assert.match(sql, /signup_not_allowed/);
    assert.match(sql, /age_years >= 13 and age_years < 18/);
    assert.match(sql, /parent_consent' = 'true'/);
    assert.doesNotMatch(sql, /create table/i);
    assert.doesNotMatch(sql, /parent_consent_email/);
  });

  it("the signup form blocks under 13 and requires the parent box for 13–17", () => {
    const form = readRepo("../../app/signup/signup-form.tsx");
    assert.match(form, /ageBand\(birthDate\) === "under13"/);
    assert.match(form, /needsParentConsent\(birthDate\) && !parentConsentChecked/);
    assert.match(form, /name="parent-consent"/);
    assert.match(form, /PARENT_CONSENT_LABEL/);
  });
});
