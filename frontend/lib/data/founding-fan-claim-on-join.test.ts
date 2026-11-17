import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL("../../../supabase/migrations/0102_founding_fan_claim_on_any_join.sql", import.meta.url),
  ),
  "utf8",
);
const exec = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const onboard = readFileSync(
  fileURLToPath(new URL("../../app/api/fan-engage/onboard/route.ts", import.meta.url)),
  "utf8",
);

describe("0102 Founding Fan claim on any join (BEP 0108 port)", () => {
  it("claims on every new membership row, by any route", () => {
    assert.match(
      exec,
      /create trigger memberships_claim_founding_fan\s+after insert on public\.fan_community_memberships\s+for each row execute function public\.claim_founding_fan_on_join\(\)/,
    );
    assert.match(exec, /perform public\.claim_founding_fan_status\(new\.fan_id, new\.community_id\)/);
  });

  it("never blocks the join and is idempotent", () => {
    assert.match(exec, /exception when others then/);
    assert.match(exec, /drop trigger if exists memberships_claim_founding_fan/);
    assert.match(exec, /create or replace function public\.claim_founding_fan_on_join/);
    assert.doesNotMatch(exec, /drop table/i);
  });

  it("leaves the claim function itself (0073) and onboarding untouched", () => {
    assert.doesNotMatch(exec, /function public\.claim_founding_fan_status/);
    assert.match(onboard, /"claim_founding_fan_status"/);
  });

  it("is not callable from the browser", () => {
    assert.match(
      exec,
      /revoke all on function public\.claim_founding_fan_on_join\(\) from public, anon, authenticated;/,
    );
  });
});
