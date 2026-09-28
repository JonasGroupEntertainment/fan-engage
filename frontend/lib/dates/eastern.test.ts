import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EASTERN_TIME_ZONE, easternDateString } from "./eastern.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

describe("easternDateString", () => {
  it("uses America/New_York", () => {
    assert.equal(EASTERN_TIME_ZONE, "America/New_York");
  });

  it("keeps the Eastern day after UTC midnight (daylight time)", () => {
    // 11 pm EDT on Sept 27 is already Sept 28 in UTC.
    assert.equal(easternDateString(new Date("2026-09-28T03:00:00Z")), "2026-09-27");
  });

  it("rolls over at Eastern midnight (daylight time)", () => {
    assert.equal(easternDateString(new Date("2026-09-28T04:00:00Z")), "2026-09-28");
  });

  it("handles standard time (UTC-5)", () => {
    assert.equal(easternDateString(new Date("2026-01-15T04:59:00Z")), "2026-01-14");
    assert.equal(easternDateString(new Date("2026-01-15T05:00:00Z")), "2026-01-15");
  });

  it("returns YYYY-MM-DD", () => {
    assert.match(easternDateString(new Date("2026-03-01T12:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("daily features use the Eastern day", () => {
  it("daily drop and check-ins no longer slice a UTC ISO date", () => {
    const drop = readRepo("../drops/daily-drop.ts");
    const checkins = readRepo("../data/checkins.ts");
    assert.match(drop, /easternDateString\(/);
    assert.match(checkins, /easternDateString\(/);
    assert.doesNotMatch(drop, /toISOString\(\)\.slice\(0, ?10\)/);
    assert.doesNotMatch(checkins, /toISOString\(\)\.slice\(0, ?10\)/);
  });
});
