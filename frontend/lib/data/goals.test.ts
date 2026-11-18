import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./goals.ts", import.meta.url)), "utf8");

describe("campaign goals count only real fans (BEP #187 port)", () => {
  it("ledger goals are scoped to the artist's community", () => {
    assert.match(src, /\.eq\("community_id", communityId\)\s*\.eq\("source", r\.metric_ref\)/);
  });
  it("internal / test fans never count toward a goal", () => {
    assert.match(src, /\.eq\("is_internal", true\)/);
    assert.match(src, /q = q\.not\("fan_id", "in", internalIds\)/);
  });
});
