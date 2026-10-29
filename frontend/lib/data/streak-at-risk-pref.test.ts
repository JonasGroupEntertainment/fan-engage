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

describe("0089_streak_at_risk_pref — notify_streak column", () => {
  const sql = stripComments(readMigration("0089_streak_at_risk_pref.sql"));

  it("adds notify_streak to notification_preferences, not null, default true", () => {
    assert.match(
      sql,
      /alter table public\.notification_preferences\s+add column if not exists notify_streak boolean not null default true/,
    );
  });

  it("is idempotent and single-statement; never drops a table", () => {
    assert.equal((sql.match(/;/g) ?? []).length, 1);
    assert.doesNotMatch(sql, /drop table/i);
    assert.match(sql, /add column if not exists/);
  });
});
