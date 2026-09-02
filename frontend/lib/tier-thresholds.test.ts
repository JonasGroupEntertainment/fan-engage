import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FALLBACK_TIERS,
  TIER_MIN_POINTS,
  currentTierFromPoints,
  isTierUnlocked,
  pointsToGold,
  tierBadgeDescription,
  tierBadgeEarned,
  tierJourneyState,
  withCanonicalThresholds,
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

describe("tier lock/unlock is one function of points", () => {
  it("overlays drifted DB min_points onto the 750 / 3,500 / 8,000 ladder", () => {
    const drifted = withCanonicalThresholds([
      { slug: "bronze", display_name: "Bronze", min_points: 0, perks: [], sort_order: 1 },
      { slug: "silver", display_name: "Silver", min_points: 2500, perks: [], sort_order: 2 },
      { slug: "gold", display_name: "Gold", min_points: 10000, perks: [], sort_order: 3 },
      { slug: "platinum", display_name: "Platinum", min_points: 25000, perks: [], sort_order: 4 },
    ]);
    assert.deepEqual(
      drifted.map((t) => t.min_points),
      [0, 750, 3500, 8000],
    );
  });

  it("unlocks Silver at 750 pts even when the fan_badges row is missing", () => {
    assert.equal(isTierUnlocked(749, TIER_MIN_POINTS.silver), false);
    assert.equal(isTierUnlocked(750, TIER_MIN_POINTS.silver), true);
    assert.equal(currentTierFromPoints(749), "bronze");
    assert.equal(currentTierFromPoints(750), "silver");
    assert.equal(
      tierBadgeEarned({ slug: "tier-silver", alreadyEarned: false, totalPoints: 750 }),
      true,
    );
    assert.equal(
      tierBadgeEarned({ slug: "tier-silver", alreadyEarned: false, totalPoints: 749 }),
      false,
    );
    assert.equal(
      tierBadgeEarned({ slug: "tier-gold", alreadyEarned: false, totalPoints: 750 }),
      false,
    );
    assert.equal(
      tierBadgeEarned({ slug: "tier-silver", alreadyEarned: true, totalPoints: 0 }),
      true,
    );
  });

  it("Home and /rewards agree: 750 pts → Silver Unlocked, Gold Locked", () => {
    const home = tierJourneyState(750);
    const rewards = tierJourneyState(750);
    assert.deepEqual(
      home.map((t) => ({ slug: t.slug, unlocked: t.unlocked, isCurrent: t.isCurrent })),
      rewards.map((t) => ({ slug: t.slug, unlocked: t.unlocked, isCurrent: t.isCurrent })),
    );
    const silver = home.find((t) => t.slug === "silver");
    const gold = home.find((t) => t.slug === "gold");
    assert.equal(silver?.unlocked, true);
    assert.equal(silver?.isCurrent, true);
    assert.equal(silver?.lockLabel, "Unlocked");
    assert.equal(gold?.unlocked, false);
    assert.equal(gold?.lockLabel, "3,500 pts");
  });

  it("getTiers, Fan Home, and /rewards consume the shared lock helper", () => {
    const tiers = readRepo("./data/tiers.ts");
    const home = readRepo("../app/page.tsx");
    const rewards = readRepo("../app/rewards/page.tsx");
    const badges = readRepo("./data/badges.ts");
    assert.match(tiers, /withCanonicalThresholds/);
    assert.match(home, /tierJourneyState/);
    assert.match(rewards, /tierJourneyState/);
    assert.match(rewards, /tierBadgeEarned/);
    assert.match(badges, /tierBadgeEarned/);
  });
});
