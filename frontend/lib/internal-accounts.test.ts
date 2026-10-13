import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INTERNAL_EMAIL_DOMAINS,
  INTERNAL_STAFF_EMAILS,
  isInternalAccountEmail,
} from "./internal-accounts.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const migrationSql = readRepo("../../supabase/migrations/0077_internal_account_tag.sql");
const signupTs = readRepo("../app/signup/signup-form.tsx");
const callbackTs = readRepo("../app/auth/callback/route.ts");

describe("isInternalAccountEmail", () => {
  it("matches the three domains, including case and plus-addressing", () => {
    assert.equal(isInternalAccountEmail("ada@jonasgroup.com"), true);
    assert.equal(isInternalAccountEmail(" Ada@JonasGroup.COM "), true);
    assert.equal(isInternalAccountEmail("ada+qa@grokbot.com"), true);
    assert.equal(isInternalAccountEmail("bot@agentmail.to"), true);
  });

  it("does not match lookalike domains", () => {
    assert.equal(isInternalAccountEmail("ada@notjonasgroup.com"), false);
    assert.equal(isInternalAccountEmail("ada@jonasgroup.com.evil.com"), false);
    assert.equal(isInternalAccountEmail("jonasgroup.com@gmail.com"), false);
    assert.equal(isInternalAccountEmail("fan@example.com"), false);
    assert.equal(isInternalAccountEmail(""), false);
    assert.equal(isInternalAccountEmail(null), false);
    assert.equal(isInternalAccountEmail("@jonasgroup.com"), false);
  });

  it("matches the staff list and nobody else at that provider", () => {
    for (const email of INTERNAL_STAFF_EMAILS) {
      assert.equal(isInternalAccountEmail(email), true);
      assert.equal(isInternalAccountEmail(` ${email.toUpperCase()} `), true);
    }
    assert.equal(isInternalAccountEmail("someoneelse@gmail.com"), false);
  });
});

describe("signup tagging and backfill", () => {
  it("keeps the SQL list aligned with the config", () => {
    for (const domain of INTERNAL_EMAIL_DOMAINS) {
      assert.match(migrationSql, new RegExp(domain.replace(".", "\\.")));
    }
    for (const email of INTERNAL_STAFF_EMAILS) {
      assert.match(migrationSql, new RegExp(email.replace(".", "\\.")));
    }
  });

  it("tags on signup and backfills without deleting rows", () => {
    assert.match(migrationSql, /fan_email_is_internal\(new\.email\)/);
    assert.match(migrationSql, /birth_date_required/);
    assert.match(migrationSql, /set is_internal = true/);
    assert.doesNotMatch(migrationSql, /delete from/i);
    assert.doesNotMatch(migrationSql, /set is_internal = false/);
    assert.match(signupTs, /tagInternalAccountOnSignup/);
    assert.match(callbackTs, /tagFanInternalIfNeeded/);
  });
});
