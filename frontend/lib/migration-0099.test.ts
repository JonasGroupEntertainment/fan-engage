import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const MIGRATION = "../../supabase/migrations/0099_drop_raelynn_community_default.sql";
const ROLLBACK = "../../supabase/rollbacks/0099_drop_raelynn_community_default_rollback.sql";

/** Tables whose community can be read from the row, and what it is read from. */
const DERIVED: Record<string, string> = {
  artist_events: "artist_slug",
  campaigns: "artist_slug",
  community_posts: "artist_slug",
  fan_actions: "artist_slug",
  event_rsvps: "event",
  event_reminders: "event",
  fan_action_completions: "action",
  purchases: "offer",
};
/** Tables with nothing to derive from: every writer must set community_id. */
const NO_TRIGGER = ["fan_badges", "points_ledger", "referrals", "offers"];
const ALL = [...Object.keys(DERIVED), ...NO_TRIGGER];

/** SQL with comment lines removed, so prose in the header cannot satisfy a check. */
const statements = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

describe("0099 drops the raelynn community default", () => {
  const sql = statements(read(MIGRATION));

  it("drops the default on all twelve tables", () => {
    for (const table of ALL) {
      assert.match(
        sql,
        new RegExp(`alter table public\\.${table} alter column community_id drop default;`),
        table,
      );
    }
  });

  it("leaves notifications alone until its three writers set a community", () => {
    assert.doesNotMatch(sql, /public\.notifications/);
  });

  it("fills the community from the row on the eight tables where it can", () => {
    for (const [table, source] of Object.entries(DERIVED)) {
      assert.match(
        sql,
        new RegExp(
          `create trigger ${table}_set_community_id\\s+before insert on public\\.${table}\\s+for each row execute function public\\.set_community_id_from_parent\\('${source}'\\);`,
        ),
        table,
      );
    }
    for (const table of NO_TRIGGER) {
      assert.doesNotMatch(sql, new RegExp(`create trigger ${table}_set_community_id`), table);
    }
  });

  it("fails loudly when no community can be worked out", () => {
    assert.match(sql, /if new\.community_id is null then\s+raise exception 'community_id is required on %'/);
    assert.match(sql, /errcode = '23502'/);
  });

  it("never overwrites a community the writer supplied", () => {
    assert.match(sql, /if new\.community_id is not null then\s+return new;/);
  });

  it("keeps the new definer function closed to browser roles", () => {
    assert.match(sql, /security definer\s+set search_path = public/);
    assert.match(
      sql,
      /revoke all on function public\.set_community_id_from_parent\(\) from public, anon, authenticated;/,
    );
  });

  it("is marked as a draft that an agent must not apply", () => {
    assert.match(read(MIGRATION), /DRAFT\. NOT applied\./);
  });
});

describe("0099 rollback", () => {
  const sql = statements(read(ROLLBACK));

  it("restores every default and removes every trigger and the function", () => {
    for (const table of ALL) {
      assert.match(
        sql,
        new RegExp(`alter table public\\.${table} alter column community_id set default 'raelynn';`),
        table,
      );
    }
    for (const table of Object.keys(DERIVED)) {
      assert.match(sql, new RegExp(`drop trigger if exists ${table}_set_community_id on public\\.${table};`));
    }
    assert.match(sql, /drop function if exists public\.set_community_id_from_parent\(\);/);
  });
});

describe("the campaign builder sets the offer's community", () => {
  it("does not rely on the offers default that 0099 removes", () => {
    const src = read("../app/admin/campaigns/actions.ts");
    assert.match(src, /\.from\("offers"\)\s*\.insert\(\{\s*community_id: artistSlug,/);
  });
});
