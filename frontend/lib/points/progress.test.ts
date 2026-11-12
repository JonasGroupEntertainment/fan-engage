import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currentTierName,
  formatPointsToast,
  nextTierProgress,
  pointsProgress,
} from "./progress.ts";
import { TIER_MIN_POINTS } from "../tier-thresholds.ts";
import type { Tier } from "../data/types.ts";

describe("nextTierProgress", () => {
  it("a new fan is working toward Silver", () => {
    assert.deepEqual(nextTierProgress(0), {
      slug: "silver",
      name: "Silver",
      pointsToGo: TIER_MIN_POINTS.silver,
    });
  });

  it("just under a threshold reports the exact gap", () => {
    assert.deepEqual(nextTierProgress(TIER_MIN_POINTS.gold - 1), {
      slug: "gold",
      name: "Gold",
      pointsToGo: 1,
    });
  });

  it("hitting a threshold exactly moves the target to the next tier", () => {
    assert.equal(nextTierProgress(TIER_MIN_POINTS.silver)?.slug, "gold");
    assert.equal(nextTierProgress(1931)?.pointsToGo, TIER_MIN_POINTS.gold - 1931);
  });

  it("returns null at the top of the ladder", () => {
    assert.equal(nextTierProgress(TIER_MIN_POINTS.platinum), null);
    assert.equal(nextTierProgress(1_000_000), null);
  });

  it("treats garbage input as zero", () => {
    assert.equal(nextTierProgress(Number.NaN)?.slug, "silver");
    assert.equal(nextTierProgress(-50)?.pointsToGo, TIER_MIN_POINTS.silver);
  });

  it("ignores DB drift in tier thresholds (canonical ladder wins)", () => {
    const drifted: Tier[] = [
      { slug: "bronze", display_name: "Bronze", min_points: 0, perks: [], sort_order: 1 },
      { slug: "silver", display_name: "Silver", min_points: 2500, perks: [], sort_order: 2 },
      { slug: "gold", display_name: "Gold", min_points: 10000, perks: [], sort_order: 3 },
      { slug: "platinum", display_name: "Platinum", min_points: 25000, perks: [], sort_order: 4 },
    ];
    assert.equal(nextTierProgress(800, drifted)?.slug, "gold");
  });
});

describe("currentTierName", () => {
  it("maps lifetime points onto the tier held", () => {
    assert.equal(currentTierName(0), "Bronze");
    assert.equal(currentTierName(TIER_MIN_POINTS.silver), "Silver");
    assert.equal(currentTierName(TIER_MIN_POINTS.gold + 5), "Gold");
    assert.equal(currentTierName(TIER_MIN_POINTS.platinum), "Platinum");
  });
});

describe("pointsProgress (before/after lifetime readings)", () => {
  it("derives the award from the lifetime delta", () => {
    const p = pointsProgress(1921, 1931);
    assert.equal(p.pointsAwarded, 10);
    assert.equal(p.lifetimePoints, 1931);
    assert.equal(p.nextTier?.pointsToGo, TIER_MIN_POINTS.gold - 1931);
  });

  it("never reports a negative award — lifetime only grows (0085)", () => {
    const p = pointsProgress(500, 400);
    assert.equal(p.pointsAwarded, 0);
    assert.equal(p.lifetimePoints, 500);
  });
});

describe("formatPointsToast", () => {
  it("renders the gap to the next tier", () => {
    assert.equal(
      formatPointsToast(pointsProgress(1921, 1931)),
      `+10 pts · ${(TIER_MIN_POINTS.gold - 1931).toLocaleString("en-US")} to Gold`,
    );
  });

  it("celebrates the top tier instead of a gap", () => {
    assert.equal(
      formatPointsToast(pointsProgress(TIER_MIN_POINTS.platinum, TIER_MIN_POINTS.platinum + 10)),
      "+10 pts · You're Platinum",
    );
  });

  it("is silent when the action earned nothing (daily cap / dedupe)", () => {
    assert.equal(formatPointsToast(pointsProgress(100, 100)), null);
    assert.equal(formatPointsToast(null), null);
  });
});
