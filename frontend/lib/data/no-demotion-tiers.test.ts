import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${name}`, import.meta.url)),
    "utf8",
  );

const sql = migration("0085_no_demotion_tiers.sql");
const fanTs = readFileSync(fileURLToPath(new URL("./fan.ts", import.meta.url)), "utf8");
const typesTs = readFileSync(fileURLToPath(new URL("./types.ts", import.meta.url)), "utf8");

describe("0085 no-demotion tiers — schema", () => {
  it("adds lifetime_points to fans and fan_community_memberships idempotently", () => {
    assert.match(
      sql,
      /alter table public\.fans\s+add column if not exists lifetime_points integer not null default 0/,
    );
    assert.match(
      sql,
      /alter table public\.fan_community_memberships\s+add column if not exists lifetime_points integer not null default 0/,
    );
  });

  it("guards the non-negative constraints behind pg_constraint checks", () => {
    assert.match(sql, /conname = 'fans_lifetime_points_nonneg'/);
    assert.match(sql, /conname = 'fan_community_memberships_lifetime_points_nonneg'/);
  });

  it("clients cannot update lifetime_points", () => {
    assert.match(
      sql,
      /revoke update \(lifetime_points\) on public\.fans from public, anon, authenticated/,
    );
    assert.match(
      sql,
      /revoke update \(lifetime_points\) on public\.fan_community_memberships from public, anon, authenticated/,
    );
  });

  it("makes no enum changes", () => {
    assert.doesNotMatch(sql, /alter type/i);
    assert.doesNotMatch(sql, /create type/i);
  });
});

describe("0085 no-demotion tiers — triggers", () => {
  it("recreates fans_update_tier on insert + update of total_points, lifetime_points", () => {
    assert.match(sql, /drop trigger if exists fans_update_tier on public\.fans;/);
    assert.match(
      sql,
      /create trigger fans_update_tier\s+before insert or update of total_points, lifetime_points on public\.fans\s+for each row execute function public\.update_fan_tier\(\)/,
    );
  });

  it("adds memberships_update_tier with the same shape", () => {
    assert.match(
      sql,
      /drop trigger if exists memberships_update_tier on public\.fan_community_memberships;/,
    );
    assert.match(
      sql,
      /create trigger memberships_update_tier\s+before insert or update of total_points, lifetime_points on public\.fan_community_memberships\s+for each row execute function public\.update_membership_tier\(\)/,
    );
  });

  it("both trigger functions compute tier from lifetime_points and only promote", () => {
    for (const fn of ["update_fan_tier", "update_membership_tier"]) {
      const start = sql.indexOf(`create or replace function public.${fn}()`);
      assert.ok(start >= 0, `${fn} defined`);
      const body = sql.slice(start, sql.indexOf("end $$;", start));
      assert.match(body, /where min_points <= coalesce\(new\.lifetime_points, 0\)/);
      assert.match(body, /if v_cur_min is null or v_new_min > v_cur_min then\s+new\.current_tier := v_new_tier;/);
      // accrues from positive movement only
      assert.match(body, /if coalesce\(new\.total_points, 0\) > coalesce\(old\.total_points, 0\) then/);
      // never reads tier from total_points
      assert.doesNotMatch(body, /min_points <= coalesce\(new\.total_points/);
    }
  });
});

describe("0085 no-demotion tiers — ledger sync no longer writes tier", () => {
  it("redefines sync_points_from_ledger(uuid) with the 0053 signature", () => {
    assert.match(
      sql,
      /create or replace function public\.sync_points_from_ledger\(p_fan_id uuid\)\s+returns integer/,
    );
    assert.match(sql, /grant execute on function public\.sync_points_from_ledger\(uuid\) to service_role/);
  });

  it("sync_points_from_ledger body sets total_points but not current_tier", () => {
    const start = sql.indexOf("create or replace function public.sync_points_from_ledger");
    const body = sql.slice(start, sql.indexOf("end $$;", start));
    assert.match(body, /set total_points = v_row\.community_pts/);
    assert.doesNotMatch(body, /current_tier\s*=/);
    assert.doesNotMatch(body, /v_tier/);
  });

  it("bump_membership_points(uuid, text, int) keeps its signature and drops the tier write", () => {
    const start = sql.indexOf("create or replace function public.bump_membership_points(");
    assert.ok(start >= 0);
    const body = sql.slice(start, sql.indexOf("end $$;", start));
    assert.match(body, /p_fan_id uuid, p_community_id text, p_delta int/);
    assert.doesNotMatch(body, /current_tier/);
    assert.match(sql, /grant execute on function public\.bump_membership_points\(uuid, text, int\) to service_role/);
  });
});

describe("0085 no-demotion tiers — backfill", () => {
  it("floors lifetime at positive ledger sum, balance and current tier threshold", () => {
    assert.match(sql, /where delta > 0\s+group by fan_id\b/);
    assert.match(sql, /where delta > 0 and community_id is not null\s+group by fan_id, community_id/);
    const floors = sql.match(/greatest\(\s*coalesce\(e\.pts, 0\),\s*coalesce\((f|m)\.total_points, 0\),\s*coalesce\(t\.min_points, 0\)\s*\)/g);
    assert.equal(floors?.length, 2);
  });

  it("only ever raises lifetime_points (idempotent re-run)", () => {
    assert.match(sql, /and coalesce\(f\.lifetime_points, 0\) < x\.lifetime/);
    assert.match(sql, /and coalesce\(m\.lifetime_points, 0\) < x\.lifetime/);
  });
});

describe("getCurrentFanKpis tier progress reads lifetime points", () => {
  const fn = fanTs.slice(fanTs.indexOf("async function getCurrentFanKpis"));

  it("FanKpis gains lifetime_points without renaming existing fields", () => {
    const kpis = typesTs.slice(typesTs.indexOf("export interface FanKpis"));
    const block = kpis.slice(0, kpis.indexOf("}"));
    for (const f of ["total_points", "lifetime_points", "referral_count", "badge_count", "next_tier", "points_to_next_tier"]) {
      assert.match(block, new RegExp(`\\b${f}:`), f);
    }
  });

  it("selects fans.lifetime_points and computes next tier from it", () => {
    assert.match(fn, /\.select\("lifetime_points"\)/);
    assert.match(fn, /filter\(\(t\) => t\.min_points > lifetime_points\)/);
    assert.match(fn, /next_tier\.min_points - lifetime_points/);
    assert.doesNotMatch(fn, /t\.min_points > total_points/);
  });

  it("keeps the wallet figure on the ledger balance and floors lifetime at it", () => {
    assert.match(fn, /typeof ledgerRes\.data === "number"\s*\?\s*ledgerRes\.data/);
    assert.match(fn, /Math\.max\(\s*typeof lifetimeRaw === "number" \? lifetimeRaw : 0,\s*total_points,?\s*\)/);
    assert.match(fn, /total_points,\s*lifetime_points,\s*referral_count/);
  });
});
