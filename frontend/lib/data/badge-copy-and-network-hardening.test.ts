import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${name}`, import.meta.url)),
    "utf8",
  );

const badgesSql = migration("0086_badge_copy_and_streak_badges.sql");
const networkSql = migration("0087_network_interim_hardening.sql");
const touchTs = readFileSync(
  fileURLToPath(new URL("../streaks/touch.ts", import.meta.url)),
  "utf8",
);

describe("0086 tier badge copy matches the 0046 ladder", () => {
  it("rewrites the three tier badge descriptions with 750 / 3,500 / 8,000", () => {
    assert.match(badgesSql, /set description = 'Crossed into Silver — 750 pts\.'\s+where slug = 'tier-silver'/);
    assert.match(badgesSql, /set description = 'Reached Gold — 3,500 pts\. Serious fan energy\.'\s+where slug = 'tier-gold'/);
    assert.match(badgesSql, /set description = 'Platinum unlocked — 8,000 pts\. Elite status\.'\s+where slug = 'tier-platinum'/);
  });

  it("does not reintroduce the pre-0046 numbers in any statement", () => {
    const statements = badgesSql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    for (const stale of ["2,500", "10,000", "25,000"]) {
      assert.ok(!statements.includes(stale), `stale threshold ${stale}`);
    }
  });
});

describe("0086 streak badges cover every milestone touch.ts upserts", () => {
  const milestones = [...touchTs.matchAll(/^\s+(\d+):\s*\d+,\s*$/gm)].map((m) => Number(m[1]));

  it("touch.ts still awards streak-<n> badges for 7 / 30 / 100 / 365", () => {
    assert.deepEqual(milestones, [7, 30, 100, 365]);
    assert.match(touchTs, /badge_slug: `streak-\$\{milestoneHit\}`/);
  });

  it("seeds a badges row per milestone, idempotently, at 0 points", () => {
    assert.match(badgesSql, /insert into public\.badges \(slug, name, description, icon, point_value, category, threshold, sort_order\)/);
    for (const n of milestones) {
      const row = new RegExp(`\\('streak-${n}',\\s*'[^']+',\\s*'[^']+',\\s*'[^']+',\\s*0,\\s*'community',\\s*${n},\\s*\\d+\\)`);
      assert.match(badgesSql, row, `streak-${n} row`);
    }
    assert.match(badgesSql, /on conflict \(slug\) do nothing;/);
  });
});

describe("0087 network RPCs are service_role only", () => {
  const signatures = [
    "network_ingest_event(uuid, jsonb)",
    "network_agent_pull(uuid)",
    "network_agent_submit(uuid, text, jsonb)",
  ];

  for (const sig of signatures) {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    it(`${sig}: existence-guarded revoke from anon + authenticated, grant to service_role`, () => {
      assert.match(networkSql, new RegExp(`if to_regprocedure\\('public\\.${esc}'\\) is not null then`));
      assert.match(
        networkSql,
        new RegExp(`revoke execute on function public\\.${esc} from public, anon, authenticated;`),
      );
      assert.match(
        networkSql,
        new RegExp(`grant execute on function public\\.${esc} to service_role;`),
      );
    });
  }

  it("drops nothing", () => {
    assert.doesNotMatch(networkSql, /^\s*drop /im);
    assert.doesNotMatch(networkSql, /execute format\('drop/i);
  });

  it("never re-grants to anon or authenticated", () => {
    assert.doesNotMatch(networkSql, /grant execute[^;]*to (anon|authenticated)/);
  });
});
