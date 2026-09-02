import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const slugFixSql = readRepo("../../supabase/migrations/0056_signup_profile_slug_collision.sql");

describe("0056 signup profile_slug collision", () => {
  it("retries a longer slug when fan-XXXX is already taken", () => {
    assert.match(slugFixSql, /create or replace function public\.set_default_fan_profile_slug/);
    assert.match(slugFixSql, /substring\(v_idhex,\s*1,\s*v_len\)|substring\([^,]+,\s*1,\s*8\)/);
    assert.match(slugFixSql, /exists\s*\(/i);
    assert.match(slugFixSql, /fans_profile_slug_unique|lower\(profile_slug\)/);
    assert.doesNotMatch(
      slugFixSql,
      /claim_founding_fan_status|0055_founding/,
    );
  });

  it("does not re-apply founding-fan 0055", () => {
    assert.doesNotMatch(slugFixSql, /update public\.badges/);
    assert.doesNotMatch(slugFixSql, /founding_fan_number/);
  });
});
