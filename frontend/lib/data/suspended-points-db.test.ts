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
    assert.match(sql, /coalesce\(p_source, ''\) = 'reward_redemption'/);
    assert.match(sql, /coalesce\(p_source, ''\) = 'manual_adjustment'/);
  });

  it("does not let a streak milestone or an unknown source through", () => {
    assert.match(sql, /coalesce\(p_source_ref, ''\) not like 'streak-milestone:%'/);
    assert.doesNotMatch(sql, /v_source not in/);
    // The app must keep using the reference the rule looks for.
    assert.match(read("../streaks/touch.ts"), /sourceRef: `streak-milestone:\$\{fanId\}:\$\{milestoneHit\}`/);
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
    assert.match(read("../../app/admin/fans/[id]/page.tsx"), /post, comment, or earn or spend points until unsuspended/);
  });
});

describe("migration 0116: suspended fans cannot redeem", () => {
  const sql = read("../../../supabase/migrations/0116_suspended_fans_cannot_redeem.sql");

  it("refuses before the reward is read or anything is written", () => {
    const guard = sql.indexOf("if v_suspended then");
    assert.ok(guard > 0);
    assert.ok(guard < sql.indexOf("select * into v_reward"));
    assert.ok(guard < sql.indexOf("insert into public.reward_redemptions"));
    assert.match(sql, /raise exception 'Account suspended: rewards cannot be redeemed';/);
  });

  it("raises the wording the app looks for", () => {
    const app = read("../reward-redeem-error.ts");
    assert.match(app, /SUSPENDED_ERROR_MARKER = "Account suspended"/);
  });

  it("the app says so before it offers an upgrade", () => {
    const app = read("./rewards.ts");
    const check = app.indexOf("self?.suspended === true");
    assert.ok(check > 0);
    assert.ok(check < app.indexOf("requirePremiumFeature(user.id"));
    assert.ok(check < app.indexOf('.rpc("redeem_reward"'));
  });

  it("keeps visitors out and has a rollback without the rule", () => {
    assert.match(sql, /revoke execute on function public\.redeem_reward\([^)]*\) from public, anon;/);
    const rollback = read("../../../supabase/rollbacks/0116_suspended_fans_cannot_redeem_rollback.sql");
    assert.doesNotMatch(rollback, /v_suspended/);
  });
});
