import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

/** Strip `-- …` comment lines so assertions only see executable SQL. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("0090_event_and_fan_locations — coordinates for Near you", () => {
  const sql = stripComments(
    readRepo("../../../supabase/migrations/0090_event_and_fan_locations.sql"),
  );

  it("adds city, region, lat, lng to artist_events idempotently", () => {
    for (const [col, type] of [
      ["city", "text"],
      ["region", "text"],
      ["lat", "double precision"],
      ["lng", "double precision"],
    ]) {
      assert.match(
        sql,
        new RegExp(
          `alter table public\\.artist_events add column if not exists ${col} ${type};`,
        ),
        `artist_events.${col}`,
      );
    }
  });

  it("adds home_region, home_lat, home_lng to fans and reuses fans.city", () => {
    assert.match(sql, /alter table public\.fans add column if not exists home_region text;/);
    assert.match(sql, /alter table public\.fans add column if not exists home_lat double precision;/);
    assert.match(sql, /alter table public\.fans add column if not exists home_lng double precision;/);
    assert.doesNotMatch(
      sql,
      /alter table public\.fans add column if not exists city\b/i,
      "fans.city already exists",
    );
  });

  it("never drops anything and uses no PostGIS", () => {
    assert.doesNotMatch(sql, /drop (table|column)/i);
    assert.doesNotMatch(sql, /postgis|geography|geometry/i);
    assert.equal((sql.match(/add column/gi) ?? []).length, 7);
  });
});

describe("app code reads the 0090 columns through the optional-column path", () => {
  const fanHome = readRepo("./fan-home.ts");
  const artists = readRepo("./artists.ts");
  const eventSelect = readRepo("./event-select.ts");

  it("event selects degrade when 0090 is not applied", () => {
    assert.match(eventSelect, /selectWithOptionalEventGeo/);
    assert.match(eventSelect, /city, region, lat, lng/);
    assert.match(fanHome, /selectWithOptionalEventGeo/);
    assert.match(artists, /selectWithOptionalEventGeo/);
  });

  it("Fan Home exposes distance + nearYou and the Today row", () => {
    assert.match(fanHome, /distanceMiles: number \| null/);
    assert.match(fanHome, /nearYou: boolean/);
    assert.match(fanHome, /today: TodayItem\[\]/);
    assert.match(fanHome, /selectTodayItems/);
  });
});
