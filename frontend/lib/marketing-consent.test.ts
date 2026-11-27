import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMAIL_CONSENT_TEXT,
  EMAIL_CONSENT_VERSION,
  MARKETING_CONSENT_COLUMNS,
  SMS_CONSENT_VERSION,
  emailConsentStamp,
  emailJoinUpdates,
  emailMarketingUpdates,
  emailReaskUpdates,
  hasRecordedEmailConsent,
  isMissingMarketingConsentColumn,
  needsEmailReask,
  omitMarketingConsent,
  smsConsentStamp,
} from "./marketing-consent.ts";

const NOW = new Date("2026-11-27T15:00:00.000Z");
const EM_DASH = String.fromCharCode(8212);

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("consent stamps", () => {
  it("stamps email consent with the server time and the wording version", () => {
    assert.deepEqual(emailConsentStamp(NOW), {
      email_consent_at: "2026-11-27T15:00:00.000Z",
      email_consent_version: EMAIL_CONSENT_VERSION,
    });
  });

  it("stamps text consent with the server time and the wording version", () => {
    assert.deepEqual(smsConsentStamp(NOW), {
      sms_consent_at: "2026-11-27T15:00:00.000Z",
      sms_consent_version: SMS_CONSENT_VERSION,
    });
  });

  it("the email wording says what is sent and how to stop", () => {
    assert.match(EMAIL_CONSENT_TEXT, /^Email me /);
    assert.match(EMAIL_CONSENT_TEXT, /Unsubscribe any time\.$/);
    assert.equal(EMAIL_CONSENT_TEXT.includes(EM_DASH), false);
  });
});

describe("who has a recorded email consent", () => {
  it("is true only with the flag on and a recorded time", () => {
    assert.equal(hasRecordedEmailConsent({ email_opted_in: true, email_consent_at: NOW.toISOString() }), true);
  });

  it("is false for a fan the old form opted in without a tick", () => {
    assert.equal(hasRecordedEmailConsent({ email_opted_in: true, email_consent_at: null }), false);
  });

  it("is false after an unsubscribe, even though the old record remains", () => {
    assert.equal(hasRecordedEmailConsent({ email_opted_in: false, email_consent_at: NOW.toISOString() }), false);
  });

  it("is false for a missing fan", () => {
    assert.equal(hasRecordedEmailConsent(null), false);
    assert.equal(hasRecordedEmailConsent(undefined), false);
  });
});

describe("who is asked again in the app", () => {
  it("asks a fan the old form opted in without a tick", () => {
    assert.equal(needsEmailReask({ email_opted_in: true, email_consent_at: null }), true);
  });

  it("does not ask a fan who ticked the box", () => {
    assert.equal(needsEmailReask({ email_opted_in: true, email_consent_at: NOW.toISOString() }), false);
  });

  it("does not ask a fan who is not opted in", () => {
    assert.equal(needsEmailReask({ email_opted_in: false, email_consent_at: null }), false);
    assert.equal(needsEmailReask(null), false);
  });
});

describe("turning marketing email on or off", () => {
  it("on opts in and records a fresh consent", () => {
    assert.deepEqual(emailMarketingUpdates(true, NOW), {
      email_opted_in: true,
      email_consent_at: "2026-11-27T15:00:00.000Z",
      email_consent_version: EMAIL_CONSENT_VERSION,
    });
  });

  it("off only clears the flag and keeps the old record", () => {
    assert.deepEqual(emailMarketingUpdates(false, NOW), { email_opted_in: false });
  });

  it("the in-app answer uses the same rule", () => {
    assert.deepEqual(emailReaskUpdates(true, NOW), emailMarketingUpdates(true, NOW));
    assert.deepEqual(emailReaskUpdates(false, NOW), { email_opted_in: false });
  });
});

describe("the email part of a join form save", () => {
  it("a ticked box opts in with a consent record", () => {
    assert.deepEqual(emailJoinUpdates(true, null, NOW), emailMarketingUpdates(true, NOW));
  });

  it("an unticked box does not opt a new fan in", () => {
    assert.deepEqual(emailJoinUpdates(false, null, NOW), { email_opted_in: false });
  });

  it("an unticked box turns off a fan the old form opted in without a tick", () => {
    assert.deepEqual(
      emailJoinUpdates(false, { email_opted_in: true, email_consent_at: null }, NOW),
      { email_opted_in: false },
    );
  });

  it("an unticked box on a repeat join leaves a recorded consent alone", () => {
    assert.deepEqual(
      emailJoinUpdates(false, { email_opted_in: true, email_consent_at: "2026-11-01T00:00:00.000Z" }, NOW),
      {},
    );
  });

  it("an unticked box does not turn email back on after an unsubscribe", () => {
    assert.deepEqual(
      emailJoinUpdates(false, { email_opted_in: false, email_consent_at: "2026-11-01T00:00:00.000Z" }, NOW),
      { email_opted_in: false },
    );
  });
});

describe("a database that does not have the consent columns yet", () => {
  it("recognises the missing column error", () => {
    assert.equal(
      isMissingMarketingConsentColumn({ code: "PGRST204", message: "Could not find the 'email_consent_at' column of 'fans'" }),
      true,
    );
    assert.equal(
      isMissingMarketingConsentColumn({ code: "42703", message: "column fans.sms_consent_version does not exist" }),
      true,
    );
  });

  it("does not mistake another error for it", () => {
    assert.equal(isMissingMarketingConsentColumn({ code: "23505", message: "duplicate key" }), false);
    assert.equal(isMissingMarketingConsentColumn(null), false);
  });

  it("drops only the consent columns from an update", () => {
    // Arrange
    const updates = { first_name: "Sam", email_opted_in: true, ...emailConsentStamp(NOW), ...smsConsentStamp(NOW) };

    // Act
    const plain = omitMarketingConsent(updates);

    // Assert
    assert.deepEqual(plain, { first_name: "Sam", email_opted_in: true });
    assert.equal("email_consent_at" in updates, true);
  });
});

describe("migration 0109", () => {
  const sql = readRepo("../../supabase/migrations/0109_marketing_consent_records.sql");
  const body = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("adds every consent column the app writes, on fans", () => {
    assert.match(body, /alter table public\.fans/);
    for (const column of MARKETING_CONSENT_COLUMNS) {
      assert.match(body, new RegExp(`add column if not exists ${column} `));
    }
  });

  it("is additive: no backfill, no drop, no default", () => {
    assert.doesNotMatch(body, /\bupdate\b|\bdrop\b|\bdefault\b|not null/i);
  });

  it("has no em dashes", () => {
    assert.equal(sql.includes(EM_DASH), false);
  });
});
