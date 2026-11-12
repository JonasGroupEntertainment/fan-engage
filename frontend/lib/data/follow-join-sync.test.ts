import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readMigration(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${name}`, import.meta.url)),
    "utf8",
  );
}

/** Strip `-- …` comment lines so assertions only see executable SQL. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("0088_follow_join_sync — Follow = Join", () => {
  const raw = readMigration("0088_follow_join_sync.sql");
  const sql = stripComments(raw);

  it("installs both AFTER INSERT triggers with the FE table names", () => {
    assert.match(
      sql,
      /create trigger trg_sync_membership_from_following\s+after insert on public\.fan_artist_following\s+for each row execute function public\.sync_membership_from_following\(\)/,
    );
    assert.match(
      sql,
      /create trigger trg_sync_following_from_membership\s+after insert on public\.fan_community_memberships\s+for each row execute function public\.sync_following_from_membership\(\)/,
    );
  });

  it("is idempotent: drops each trigger before creating it", () => {
    assert.match(sql, /drop trigger if exists trg_sync_membership_from_following\s+on public\.fan_artist_following/);
    assert.match(sql, /drop trigger if exists trg_sync_following_from_membership\s+on public\.fan_community_memberships/);
    assert.equal((sql.match(/create or replace function/g) ?? []).length, 2);
  });

  it("uses FE column names, not the BEP ones", () => {
    assert.match(sql, /insert into public\.fan_artist_following \(fan_id, artist_slug, followed_at\)/);
    assert.match(sql, /insert into public\.fan_community_memberships\s+\(fan_id, community_id, joined_at, status\)/);
    for (const bepName of ["member_id", "brand_slug", "member_brand_following", "member_community_memberships", "public.brands"]) {
      assert.doesNotMatch(sql, new RegExp(bepName), `BEP name leaked: ${bepName}`);
    }
  });

  it("only mirrors when the counterpart row exists (communities / artists)", () => {
    assert.match(sql, /exists \(select 1 from public\.communities c where c\.slug = new\.artist_slug\)/);
    assert.match(sql, /exists \(select 1 from public\.artists a where a\.slug = new\.community_id\)/);
  });

  it("every mirrored insert and backfill is ON CONFLICT DO NOTHING (no loops, no overwrites)", () => {
    const inserts = sql.match(/insert into public\.(fan_artist_following|fan_community_memberships)/g) ?? [];
    const conflicts = sql.match(/on conflict \((fan_id, artist_slug|fan_id, community_id)\) do nothing/g) ?? [];
    assert.equal(inserts.length, 4, "2 trigger inserts + 2 backfills");
    assert.equal(conflicts.length, inserts.length);
    assert.doesNotMatch(sql, /do update/i);
  });

  it("never mirrors deletes (unfollow must not destroy a points balance)", () => {
    assert.doesNotMatch(sql, /after delete/i);
    assert.doesNotMatch(sql, /before delete/i);
    assert.doesNotMatch(sql, /\bdelete from\b/i);
    assert.doesNotMatch(sql, /after insert or update/i);
    assert.match(raw, /DELETES ARE NOT MIRRORED/);
  });

  it("trigger functions are SECURITY DEFINER with a pinned search_path and not client-callable", () => {
    const fnBlocks = sql.split(/create or replace function/).slice(1);
    assert.equal(fnBlocks.length, 2);
    for (const block of fnBlocks) {
      assert.match(block, /security definer/);
      assert.match(block, /set search_path = public/);
    }
    assert.match(sql, /revoke execute on function public\.sync_following_from_membership\(\) from public, anon, authenticated/);
    assert.match(sql, /revoke execute on function public\.sync_membership_from_following\(\) from public, anon, authenticated/);
  });

  it("leaves referral_code to the fans table (never sets it on memberships)", () => {
    assert.doesNotMatch(sql, /referral_code/);
  });

  it("backfills both directions, only active memberships produce follows", () => {
    assert.match(
      sql,
      /from public\.fan_community_memberships m\s+join public\.artists a on a\.slug = m\.community_id\s+where m\.status = 'active'/,
    );
    assert.match(
      sql,
      /from public\.fan_artist_following f\s+join public\.communities c on c\.slug = f\.artist_slug/,
    );
  });

  it("documents the recursion argument and ships a verify block", () => {
    assert.match(raw, /DO NOTHING conflict fires no row trigger/);
    assert.match(raw, /Verify/);
    assert.match(raw, /pg_trigger/);
  });
});
