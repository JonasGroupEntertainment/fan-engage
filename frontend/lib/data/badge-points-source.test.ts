import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ENUM_MIGRATION = "0106_point_source_badge.sql";
const MIGRATION = "0107_badge_points_own_source.sql";
const PREVIOUS = "0100_notifications_community.sql";
const EM_DASH = String.fromCharCode(8212);

function readFrontend(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}

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

/** Body of award_community_badge in a migration file. */
function awardBody(sql: string): string {
  const start = sql.indexOf("create or replace function public.award_community_badge(");
  assert.notEqual(start, -1, "award_community_badge is defined");
  const end = sql.indexOf("$function$;", start);
  assert.notEqual(end, -1, "award_community_badge is closed");
  return sql.slice(start, end);
}

describe("badge points have their own ledger name", () => {
  it("adds the enum value in a file of its own", () => {
    // Arrange
    const sql = stripComments(readMigration(ENUM_MIGRATION)).trim();

    // Assert: Postgres cannot use a new enum value in the transaction that adds it.
    assert.equal(sql, "alter type public.point_source add value if not exists 'badge';");
  });

  it("does not add the enum value in the file that uses it", () => {
    assert.doesNotMatch(stripComments(readMigration(MIGRATION)), /alter type/i);
  });

  it("awards badge points as 'badge', never as a manual adjustment", () => {
    // Arrange
    const body = awardBody(readMigration(MIGRATION));

    // Assert
    assert.match(body, /v_points,\s+'badge',\s+v_ref,/);
    assert.doesNotMatch(body, /manual_adjustment/);
  });

  it("changes nothing else in the badge award", () => {
    // Arrange
    const before = awardBody(readMigration(PREVIOUS));
    const after = awardBody(readMigration(MIGRATION));

    // Act
    const restored = after.replace("'badge',", "'manual_adjustment',");

    // Assert: the amount, the guards and the notification are untouched.
    assert.equal(restored, before);
  });

  it("renames only existing badge rows", () => {
    assert.match(
      stripComments(readMigration(MIGRATION)),
      /set source = 'badge'\s+where source = 'manual_adjustment'\s+and source_ref like 'badge:%';/,
    );
  });
});

describe("old daily drop rows take the daily drop name", () => {
  it("moves only rows with a daily drop reference", () => {
    assert.match(
      stripComments(readMigration(MIGRATION)),
      /set source = 'daily_drop'\s+where source = 'manual_adjustment'\s+and source_ref like 'daily-drop:%';/,
    );
  });

  it("is safe because the daily drop claim is found by reference alone", () => {
    // Arrange
    const src = readFrontend("lib/drops/daily-drop.ts");
    const lookup = src.slice(src.indexOf("Look up by source_ref only"), src.indexOf("if (existing)"));

    // Assert
    assert.match(lookup, /\.eq\("source_ref", sourceRef\)/);
    assert.doesNotMatch(lookup, /\.eq\("source",/);
  });

  it("changes no balance: the file has no delta, insert or delete", () => {
    // Arrange
    const sql = stripComments(readMigration(MIGRATION));
    const backfills = sql.slice(sql.indexOf("$function$;"));

    // Assert
    assert.doesNotMatch(backfills, /delta|insert into|delete from/i);
  });
});

describe("the points breakdown names the sources", () => {
  it("labels badge points and daily drops for fans", () => {
    // Arrange
    const src = readFrontend("lib/data/fan.ts");

    // Assert
    assert.match(src, /\n {2}badge: "Badges",\n/);
    assert.match(src, /\n {2}daily_drop: "Daily drops",\n/);
    assert.match(src, /manual_adjustment: "Adjustments"/);
  });

  it("the monthly recap already labels badge points", () => {
    assert.match(readFrontend("lib/recap/gather.ts"), /\n {2}badge: "Badges",\n/);
  });
});

describe("the migration files follow the house rules", () => {
  it("have no em dashes", () => {
    for (const name of [ENUM_MIGRATION, MIGRATION]) {
      assert.equal(readMigration(name).includes(EM_DASH), false, name);
    }
  });
});
