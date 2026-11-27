import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// Kevin, 2026-11-27: a suspended fan stops earning points. The behaviour is
// proved on a local Postgres (supabase/tests/local/suspended_points_*.sql);
// these checks keep the migration and the wording from drifting.
describe("migration 0115: suspended fans earn no points", () => {
  const sql = read("../../../supabase/migrations/0115_suspended_fans_earn_no_points.sql");

  it("refuses a positive award for a suspended fan before anything is written", () => {
    const guard = sql.indexOf("if v_suspended");
    assert.ok(guard > 0);
    assert.ok(guard < sql.indexOf("insert into public.points_ledger"));
    assert.match(sql, /if v_suspended\s+and p_base_delta > 0/);
  });

  it("still lets a refund and a team adjustment through", () => {
    assert.match(sql, /v_source not in \('reward_redemption', 'manual_adjustment'\)/);
  });

  it("reads the flag under the same row lock the function already took", () => {
    assert.match(sql, /select coalesce\(f\.suspended, false\) into v_suspended\s+from public\.fans f where f\.id = p_fan_id for update;/);
  });

  it("stays closed to signed-in sessions", () => {
    assert.match(sql, /revoke execute on function public\.apply_points_award\([^)]*\) from public, anon, authenticated;/);
  });

  it("has a rollback without the rule", () => {
    const rollback = read("../../../supabase/rollbacks/0115_suspended_fans_earn_no_points_rollback.sql");
    assert.doesNotMatch(rollback, /v_suspended/);
    assert.match(rollback, /create or replace function public\.apply_points_award/);
  });

  it("the suspend button says so", () => {
    assert.match(read("../../app/admin/fans/[id]/page.tsx"), /post, comment or earn points until unsuspended/);
  });
});
