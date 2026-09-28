import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const celebrate = readRepo("./celebrate.ts");

describe("anniversary points go through apply_points_award", () => {
  it("awards with the anniversary source and a per-fan, per-artist, per-marker ref", () => {
    assert.match(celebrate, /awardPoints\(/);
    assert.match(celebrate, /source: "anniversary"/);
    assert.match(celebrate, /sourceRef: anniversaryAwardRef\(/);
    assert.match(celebrate, /`anniversary:\$\{fanId\}:\$\{artistSlug\}:\$\{marker\}`/);
  });

  it("no longer writes the ledger or total_points directly", () => {
    assert.doesNotMatch(celebrate, /from\("points_ledger"\)/);
    assert.doesNotMatch(celebrate, /total_points/);
  });

  it("releases the dedupe row when the award fails so the next scan retries", () => {
    assert.match(celebrate, /from\("fan_anniversary_log"\)[\s\S]*\.delete\(\)/);
  });
});

describe("daily drop claim", () => {
  const drop = readRepo("../drops/daily-drop.ts");

  it("detects a prior claim by its per-fan, per-day ref only", () => {
    assert.match(drop, /`daily-drop:\$\{fanId\}:\$\{dateStr\}`/);
    assert.doesNotMatch(drop, /\.eq\("source"/);
  });

  it("treats a deduped award (0 points) as already claimed", () => {
    assert.match(drop, /awarded === 0/);
  });
});

describe("migrations for the new point sources", () => {
  const m65 = readRepo("../../../supabase/migrations/0065_anniversary_daily_drop_point_sources.sql");
  const m66 = readRepo("../../../supabase/migrations/0066_no_multiplier_on_refunds.sql");
  const HEADER = "-- Not yet applied to production; apply via MCP before merge.";

  it("0065 only adds the two enum values, idempotently", () => {
    assert.equal(m65.split("\n")[0], HEADER);
    const statements = m65
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.trim().startsWith("--"));
    assert.deepEqual(statements, [
      "alter type point_source add value if not exists 'anniversary';",
      "alter type point_source add value if not exists 'daily_drop';",
    ]);
  });

  it("0066 skips the multiplier on refunds and keeps the function closed", () => {
    assert.equal(m66.split("\n")[0], HEADER);
    assert.match(m66, /v_source <> 'reward_redemption'/);
    assert.match(m66, /security definer/i);
    assert.match(m66, /revoke (all|execute)[\s\S]*from public, anon, authenticated/i);
    assert.match(m66, /grant execute[\s\S]*to service_role/i);
  });
});
