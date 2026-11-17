import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/0103_lock_down_trigger_functions.sql", import.meta.url)),
  "utf8",
)
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("0103 lock down trigger functions (BEP 0094 port)", () => {
  it("sweeps every SECURITY DEFINER trigger function in public", () => {
    assert.match(sql, /n\.nspname = 'public'/);
    assert.match(sql, /p\.prosecdef/);
    assert.match(sql, /p\.prorettype = 'pg_catalog\.trigger'::pg_catalog\.regtype/);
  });
  it("revokes from browser roles and keeps service_role", () => {
    assert.match(sql, /revoke execute on function %s from public, anon, authenticated/);
    assert.match(sql, /grant execute on function %s to service_role/);
  });
  it("changes no tables", () => {
    assert.doesNotMatch(sql, /drop table|alter table/i);
  });
});
