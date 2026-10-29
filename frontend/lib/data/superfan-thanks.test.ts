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

describe("0095_superfan_thanks — table + RLS", () => {
  const sql = stripComments(readMigration("0095_superfan_thanks.sql"));

  it("creates superfan_thanks with the agreed columns and composite key", () => {
    assert.match(sql, /create table if not exists public\.superfan_thanks \(/);
    assert.match(sql, /community_id\s+text not null references public\.communities\(slug\)/);
    assert.match(sql, /fan_id\s+uuid not null references public\.fans\(id\)/);
    assert.match(sql, /thanked_by\s+uuid references public\.fans\(id\)/);
    assert.match(sql, /thanked_at\s+timestamptz not null default now\(\)/);
    assert.match(sql, /note\s+text/);
    assert.match(sql, /primary key \(community_id, fan_id, thanked_at\)/);
  });

  it("enables RLS: service_role everything, admins of the community read + insert only", () => {
    assert.match(sql, /alter table public\.superfan_thanks enable row level security/);
    assert.match(sql, /create policy superfan_thanks_service_all on public\.superfan_thanks\s+for all to service_role/);
    assert.match(sql, /create policy superfan_thanks_admin_read on public\.superfan_thanks\s+for select to authenticated using \(public\.is_admin_of\(community_id\)\)/);
    assert.match(sql, /create policy superfan_thanks_admin_insert on public\.superfan_thanks\s+for insert to authenticated with check \(public\.is_admin_of\(community_id\)\)/);
    assert.doesNotMatch(sql, /for (update|delete) to authenticated/);
    assert.match(sql, /grant select, insert on public\.superfan_thanks to authenticated/);
  });

  it("is idempotent and never drops a table", () => {
    assert.doesNotMatch(sql, /drop table/i);
    assert.doesNotMatch(sql, /drop function/i);
    assert.match(sql, /create index if not exists superfan_thanks_fan_idx/);
    const creates = sql.match(/create policy /g) ?? [];
    const drops = sql.match(/drop policy if exists /g) ?? [];
    assert.equal(creates.length, 3);
    assert.equal(drops.length, creates.length);
  });

  it("is_admin_of exists (0011) for the policies to call", () => {
    const m11 = readMigration("0011_multi_tenant.sql");
    assert.match(m11, /create or replace function public\.is_admin_of\(p_community_id text\)/);
  });
});
