import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const resolve = read("./resolve.ts");
const migration = read("../../../supabase/migrations/0064_prediction_correct_point_source.sql");

const body = resolve.slice(
  resolve.indexOf("export async function resolvePrediction("),
  resolve.indexOf("export function predictionAwardRef("),
);

describe("prediction payout", () => {
  it("pays through apply_points_award with a per-fan ref", () => {
    assert.match(body, /admin\.rpc\(\s*"apply_points_award"/);
    assert.match(body, /p_source: "prediction_correct"/);
    assert.match(body, /p_source_ref: predictionAwardRef\(opts\.postId, fanId\)/);
    assert.match(body, /p_community_id: post\.artist_slug/);
    assert.match(resolve, /return `prediction:\$\{postId\}:\$\{fanId\}`;/);
  });

  it("never reads and rewrites fans.total_points or writes the ledger directly", () => {
    assert.doesNotMatch(body, /total_points/);
    assert.doesNotMatch(body, /from\("points_ledger"\)/);
  });

  it("stops on an award error instead of ignoring it", () => {
    assert.match(body, /if \(awardErr\) throw awardErr;/);
  });

  it("writes the award log only after the points are paid", () => {
    assert.ok(
      body.indexOf('"apply_points_award"') < body.indexOf('from("prediction_award_log").insert'),
    );
  });

  it("adds prediction_correct to the point_source enum on its own", () => {
    assert.match(migration, /alter type point_source add value if not exists 'prediction_correct';/);
    const statements = migration
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"));
    assert.equal(statements.length, 1);
  });
});
