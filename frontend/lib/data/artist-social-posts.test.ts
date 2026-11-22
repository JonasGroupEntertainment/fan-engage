import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const MIGRATION = "0104_artist_social_posts.sql";
const TABLES = ["artist_social_accounts", "artist_social_posts"];
const EM_DASH = String.fromCharCode(8212);

function readMigration(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${name}`, import.meta.url)),
    "utf8",
  );
}

/** Strip comment lines so assertions only see executable SQL. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("0104_artist_social_posts", () => {
  const raw = readMigration(MIGRATION);
  const sql = stripComments(raw);

  it("says in its header that it is not yet applied to production", () => {
    assert.match(raw.split("\n").slice(0, 5).join("\n"), /Not yet applied to production\./);
  });

  it("creates both tables against the artist and community post keys", () => {
    for (const table of TABLES) {
      assert.match(sql, new RegExp(`create table if not exists public\\.${table} \\(`));
    }
    assert.equal(
      (sql.match(/artist_slug\s+text not null references public\.artists\(slug\) on delete cascade/g) ?? []).length,
      2,
    );
    assert.match(sql, /community_post_id\s+uuid references public\.community_posts\(id\) on delete set null/);
    assert.match(sql, /unique \(artist_slug, platform\)/);
    assert.match(sql, /unique \(community_post_id, platform\)/);
  });

  it("uses text with a check, never an enum, and allows the pending status", () => {
    assert.doesNotMatch(sql, /create type|alter type/i);
    assert.equal((sql.match(/check \(platform in \('facebook', 'instagram'\)\)/g) ?? []).length, 2);
    assert.match(sql, /check \(status in \('pending', 'sent', 'skipped', 'failed'\)\)/);
  });

  it("allows one send per platform for each submit key", () => {
    assert.match(
      sql,
      /create unique index if not exists artist_social_posts_submit_key_idx\s+on public\.artist_social_posts \(artist_slug, submit_key, platform\)\s+where submit_key is not null;/,
    );
  });

  it("is service role only: row level security on, no policies, no client grants", () => {
    for (const table of TABLES) {
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
      assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated;`));
      assert.match(sql, new RegExp(`grant all on public\\.${table} to service_role;`));
    }
    assert.doesNotMatch(sql, /create policy/i);
  });

  it("is safe to run again, adds no rows, and drops nothing", () => {
    assert.doesNotMatch(sql, /insert into|drop table|delete from|update public/i);
    assert.doesNotMatch(sql, /create table (?!if not exists)/i);
    assert.doesNotMatch(sql, /create (unique )?index (?!if not exists)/i);
  });

  it("has no em dash", () => {
    assert.ok(!raw.includes(EM_DASH));
  });
});
