import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const initSql = readRepo("../../supabase/migrations/0001_init.sql");
const namesSql = readRepo("../../supabase/migrations/0043_fan_display_names.sql");
const lockSql = readRepo("../../supabase/migrations/0050_lock_redeem_and_membership_economy.sql");
const loopSql = readRepo("../../supabase/migrations/0053_superfan_loop.sql");
const rpcLockSql = readRepo(
  "../../supabase/migrations/0054_revoke_anon_security_definer_rpcs.sql",
);
const sharedRateLimitSql = readRepo(
  "../../supabase/migrations/0057_shared_auth_rate_limits.sql",
);
const displayTs = readRepo("./data/fan-profile.ts");

describe("RLS audit — fans / points / rewards / redemptions / posts", () => {
  it("fans self-select only; display RPC returns id + first_name, never email", () => {
    assert.match(initSql, /create policy fans_self_select on public\.fans/);
    assert.match(initSql, /auth\.uid\(\) = id/);
    assert.match(namesSql, /returns table \(id uuid, first_name text\)/);
    assert.match(namesSql, /select f\.id, f\.first_name/);
    assert.doesNotMatch(namesSql, /f\.email/);
    assert.match(displayTs, /never email, phone, stripe ids/);
  });

  it("clients cannot insert ledger rows or mint points columns", () => {
    assert.match(initSql, /create policy points_self_select on public\.points_ledger/);
    assert.match(initSql, /auth\.uid\(\) = fan_id/);
    assert.match(loopSql, /revoke insert, update, delete on public\.points_ledger/);
    assert.match(loopSql, /revoke all on function public\.apply_points_award/);
    assert.match(loopSql, /grant execute on function public\.apply_points_award[\s\S]*service_role/);
    assert.match(lockSql, /Cannot set protected fan economy columns/);
    assert.match(loopSql, /new\.founding_fan_number is not null/);
    assert.match(loopSql, /new\.founding_fan_number is distinct from old\.founding_fan_number/);
  });

  it("redemptions are RPC-only and bound to auth.uid()", () => {
    assert.match(loopSql, /revoke insert, update, delete on public\.reward_redemptions/);
    assert.match(loopSql, /auth\.uid\(\) is distinct from p_fan_id/);
    assert.match(loopSql, /revoke all on function public\.redeem_reward\(uuid, uuid, text\) from public, anon/);
  });

  it("rewards catalog is not client-writable", () => {
    assert.match(loopSql, /revoke insert, update, delete on public\.rewards_catalog/);
  });

  it("display names and ledger RPCs do not expose email", () => {
    assert.match(loopSql, /returns table \(id uuid, first_name text\)/);
    assert.doesNotMatch(loopSql, /f\.email/);
    assert.match(loopSql, /Not authorized to read another fan ledger/);
  });

  it("0054 revokes anon execute on remaining SECURITY DEFINER RPCs", () => {
    assert.match(
      rpcLockSql,
      /revoke all on function public\.auto_grant_super_admin\(\) from public, anon, authenticated/,
    );
    assert.match(
      rpcLockSql,
      /revoke all on function public\.apply_moderation_decision\([\s\S]*?\) from public, anon, authenticated/,
    );
    assert.match(
      rpcLockSql,
      /revoke all on function public\.award_badge\(uuid, text\) from public, anon, authenticated/,
    );
    assert.match(
      rpcLockSql,
      /grant execute on function public\.auto_grant_super_admin\(\) to postgres, service_role/,
    );
    assert.match(
      rpcLockSql,
      /grant execute on function public\.apply_moderation_decision\([\s\S]*?\) to service_role/,
    );
    assert.match(
      rpcLockSql,
      /grant execute on function public\.award_badge\(uuid, text\) to postgres, service_role/,
    );
    const grantStmts = rpcLockSql.match(/grant execute on function public\.\w+[\s\S]*?;/gi) ?? [];
    assert.equal(grantStmts.length, 3);
    for (const stmt of grantStmts) {
      assert.doesNotMatch(stmt, /\banon\b/);
      assert.doesNotMatch(stmt, /\bauthenticated\b/);
    }
  });

  it("0054 does not loosen apply_points_award or redeem_reward", () => {
    assert.doesNotMatch(rpcLockSql, /grant execute on function public\.apply_points_award/);
    assert.doesNotMatch(rpcLockSql, /grant execute on function public\.redeem_reward/);
    assert.doesNotMatch(
      rpcLockSql,
      /revoke all on function public\.apply_points_award/,
    );
    assert.doesNotMatch(
      rpcLockSql,
      /revoke all on function public\.redeem_reward/,
    );
    assert.match(
      loopSql,
      /revoke all on function public\.apply_points_award\(uuid, integer, text, text, text, text\) from public, anon, authenticated/,
    );
    assert.match(
      loopSql,
      /grant execute on function public\.apply_points_award[\s\S]*service_role/,
    );
    assert.match(
      loopSql,
      /revoke all on function public\.redeem_reward\(uuid, uuid, text\) from public, anon/,
    );
    assert.match(
      loopSql,
      /grant execute on function public\.redeem_reward\(uuid, uuid, text\) to authenticated, service_role/,
    );
  });

  it("0057 keeps shared rate-limit state private and service-role only", () => {
    assert.match(sharedRateLimitSql, /create table if not exists private\.auth_rate_limits/);
    assert.doesNotMatch(sharedRateLimitSql, /raw_identifier|client_ip|ip_address/);
    assert.match(sharedRateLimitSql, /identifier_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
    assert.match(sharedRateLimitSql, /on conflict \(scope, identifier_hash\) do update/);
    assert.match(sharedRateLimitSql, /security definer\s+set search_path = ''/);
    assert.match(
      sharedRateLimitSql,
      /revoke all on function public\.consume_rate_limit[\s\S]*from public, anon, authenticated/,
    );
    assert.match(
      sharedRateLimitSql,
      /grant execute on function public\.consume_rate_limit[\s\S]*to service_role/,
    );
  });
});
