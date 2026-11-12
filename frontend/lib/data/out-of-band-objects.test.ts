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

const TABLES = [
  "push_subscriptions",
  "notification_preferences",
  "notification_log",
  "streak_log",
  "reward_drop_notifications",
  "artist_post_drafts",
  "audience_segments",
] as const;

const RPCS = [
  "evaluate_audience_segment",
  "find_threads_needing_summary",
  "list_digest_recipients_at_hour",
] as const;

describe("0092_out_of_band_objects — prod objects reproduced idempotently", () => {
  const raw = readMigration("0092_out_of_band_objects.sql");
  const sql = stripComments(raw);

  it("creates every out-of-band table with `create table if not exists`", () => {
    for (const t of TABLES) {
      assert.match(sql, new RegExp(`create table if not exists public\\.${t}\\s*\\(`), `missing: ${t}`);
    }
  });

  it("creates every out-of-band RPC with `create or replace function`", () => {
    for (const fn of RPCS) {
      assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\s*\\(`), `missing: ${fn}`);
    }
  });

  it("never drops a table (prod data is untouched)", () => {
    assert.doesNotMatch(sql, /\bdrop table\b/i);
    assert.doesNotMatch(sql, /\btruncate\b/i);
    assert.doesNotMatch(sql, /\bdelete from\b/i);
  });

  it("enables RLS and re-creates policies idempotently on every table", () => {
    for (const t of TABLES) {
      assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), `RLS: ${t}`);
      assert.match(sql, new RegExp(`drop policy if exists \\w+ on public\\.${t}`), `policy guard: ${t}`);
      assert.match(sql, new RegExp(`create policy \\w+ on public\\.${t}`), `policy: ${t}`);
    }
    // every create policy is preceded by a matching drop policy if exists
    const created = [...sql.matchAll(/create policy (\w+) on public\.(\w+)/g)].map((m) => `${m[1]}@${m[2]}`);
    const dropped = [...sql.matchAll(/drop policy if exists (\w+) on public\.(\w+)/g)].map((m) => `${m[1]}@${m[2]}`);
    for (const c of created) assert.ok(dropped.includes(c), `no drop-guard for policy ${c}`);
    assert.equal(created.length, 15);
  });

  it("replaces the older notification_prefs_* policy pair with the notif_prefs_* set", () => {
    assert.match(sql, /drop policy if exists notification_prefs_self_read on public\.notification_preferences/);
    assert.match(sql, /drop policy if exists notification_prefs_self_upsert on public\.notification_preferences/);
    assert.doesNotMatch(sql, /create policy notification_prefs_/);
    for (const p of ["notif_prefs_self_read", "notif_prefs_self_update", "notif_prefs_self_upsert"]) {
      assert.match(sql, new RegExp(`create policy ${p} on public\\.notification_preferences`));
    }
  });

  it("guards every added constraint on pg_constraint and uses `create index if not exists`", () => {
    const adds = sql.match(/add constraint \w+/g) ?? [];
    const guards = sql.match(/if not exists \(select 1 from pg_constraint where conname = '\w+'/g) ?? [];
    assert.ok(adds.length > 0);
    assert.equal(adds.length, guards.length, "every add constraint has a conname guard");
    assert.doesNotMatch(sql, /create index on/i);
    assert.doesNotMatch(sql, /create unique index on/i);
    assert.match(sql, /create index if not exists push_subscriptions_fan_idx/);
  });

  it("audience_segments.fan_ids is uuid[] (the DDL pull printed ARRAY)", () => {
    assert.match(sql, /fan_ids\s+uuid\[\] not null default '\{\}'/);
    assert.doesNotMatch(sql, /fan_ids\s+ARRAY/);
  });

  it("restricted RPCs revoke from anon and grant only service_role", () => {
    assert.match(sql, /revoke execute on function public\.evaluate_audience_segment\(jsonb, text, integer\) from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.evaluate_audience_segment\(jsonb, text, integer\) to service_role/);
    assert.match(sql, /revoke execute on function public\.list_digest_recipients_at_hour\(smallint, integer\) from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.list_digest_recipients_at_hour\(smallint, integer\) to service_role/);
    // find_threads_needing_summary stays as live (public execute)
    assert.doesNotMatch(sql, /revoke execute on function public\.find_threads_needing_summary/);
  });

  it("guards the two column-dependent RPCs on the columns and wrapped function existing", () => {
    assert.match(sql, /column_name = 'thread_summary_count'/);
    assert.match(sql, /column_name = 'optimal_notification_hour'/);
    assert.match(sql, /p\.proname = 'list_digest_recipients'/);
    assert.match(sql, /alter table public\.fans\s+add column if not exists optimal_notification_hour smallint/);
  });

  it("header documents provenance, code paths and the 0062 fresh-boot caveat", () => {
    assert.match(raw, /out-of-band-ddl\.md/);
    assert.match(raw, /0062_lock_down_security_definer_functions\.sql/);
    for (const t of [...TABLES, ...RPCS]) assert.match(raw, new RegExp(`^--\\s+${t}\\b`, "m"), `header row: ${t}`);
  });
});
