import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const communityTs = readRepo("./community.ts");
const artistsTs = readRepo("./artists.ts");
const seedTs = readRepo("../app/admin/community/seed/actions.ts");
const migrationSql = readRepo(
  "../../supabase/migrations/0052_amy_stroup_inactive_pool.sql",
);

describe("Amy solo vs Danger Twins community pools", () => {
  it("keeps dangertwins on danger-twins and points amystroup at amy-stroup", () => {
    assert.match(communityTs, /dangertwins:\s*"danger-twins"/);
    assert.match(communityTs, /amystroup:\s*"amy-stroup"/);
    assert.doesNotMatch(communityTs, /amystroup:\s*"danger-twins"/);
    assert.match(communityTs, /separate invite\/community pools/);
  });

  it("seeds amy-stroup as an inactive pool and does not launch it", () => {
    assert.match(migrationSql, /'amy-stroup'/);
    assert.match(migrationSql, /'Amy Stroup'/);
    assert.match(migrationSql, /'amystroup'/);
    assert.match(migrationSql, /active\s*=\s*false/);
    assert.doesNotMatch(migrationSql, /active\s*=\s*true/);
    assert.doesNotMatch(migrationSql, /values\s*\(\s*'bailee'/);
    assert.doesNotMatch(migrationSql, /values\s*\(\s*'bailee-madison'/);
    assert.doesNotMatch(migrationSql, /values\s*\(\s*'denise-jonas'/);
    assert.doesNotMatch(migrationSql, /values\s*\(\s*'franklin-jonas'/);
    assert.doesNotMatch(migrationSql, /values\s*\(\s*'raelynn'/);
  });

  it("does not add amy-stroup to the hardcoded public ARTISTS map", () => {
    assert.doesNotMatch(artistsTs, /"amy-stroup"/);
  });
});

describe("Danger Twins partner copy", () => {
  it("uses Andrew Bissell in the public tagline and seed copy", () => {
    assert.match(
      artistsTs,
      /Amy Stroup \+ Andrew Bissell\. Two voices, one frequency\./,
    );
    assert.match(seedTs, /Amy Stroup and Andrew Bissell/);
    assert.match(seedTs, /Andrew Bissell's music/);
  });
});
