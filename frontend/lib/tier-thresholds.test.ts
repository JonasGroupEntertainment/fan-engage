import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FALLBACK_TIERS,
  TIER_MIN_POINTS,
  pointsToGold,
  tierBadgeDescription,
} from "./tier-thresholds.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("tier thresholds are one ladder", () => {
  it("uses 750 / 3,500 / 8,000 — not the legacy 2,500 / 10,000 / 25,000", () => {
    assert.equal(TIER_MIN_POINTS.silver, 750);
    assert.equal(TIER_MIN_POINTS.gold, 3500);
    assert.equal(TIER_MIN_POINTS.platinum, 8000);
    assert.deepEqual(
      FALLBACK_TIERS.map((t) => t.min_points),
      [0, 750, 3500, 8000],
    );
    assert.equal(pointsToGold(0), 3500);
    assert.equal(pointsToGold(4000), 0);
  });

  it("badge copy matches the same thresholds", () => {
    assert.equal(tierBadgeDescription("tier-silver", 750), "Crossed into Silver — 750 pts.");
    assert.equal(
      tierBadgeDescription("tier-gold", 3500),
      "Reached Gold — 3,500 pts. Serious fan energy.",
    );
    assert.equal(
      tierBadgeDescription("tier-platinum", 8000),
      "Platinum unlocked — 8,000 pts. Elite status.",
    );
    assert.doesNotMatch(tierBadgeDescription("tier-silver", 750) ?? "", /2,500/);
    assert.doesNotMatch(tierBadgeDescription("tier-gold", 3500) ?? "", /10,000/);
  });

  it("Fan Home, badge gallery, and SMS copy share the module", () => {
    const tiers = readRepo("./data/tiers.ts");
    const badges = readRepo("./data/badges.ts");
    const sms = readRepo("../app/settings/notifications/page.tsx");
    assert.match(tiers, /FALLBACK_TIERS|TIER_MIN_POINTS/);
    assert.match(badges, /tierBadgeDescription/);
    assert.match(sms, /pointsToGold|TIER_MIN_POINTS/);
    assert.doesNotMatch(sms, /10000/);
  });
});
