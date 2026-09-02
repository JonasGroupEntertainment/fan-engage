import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FOUNDING_FAN_BADGE_SLUGS,
  foundingFanBadgeEarned,
  isFoundingFanBadgeSlug,
} from "./founding-fan-badge.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("Founding Fan free badge (first 100, not Premium)", () => {
  it("recognizes both historical slugs", () => {
    assert.deepEqual([...FOUNDING_FAN_BADGE_SLUGS], ["founding-fan", "founder-fan"]);
    assert.equal(isFoundingFanBadgeSlug("founding-fan"), true);
    assert.equal(isFoundingFanBadgeSlug("founder-fan"), true);
    assert.equal(isFoundingFanBadgeSlug("tier-gold"), false);
  });

  it("unlocks when founding_fan_number is 1–100 even if the row is missing", () => {
    assert.equal(
      foundingFanBadgeEarned({
        slug: "founding-fan",
        alreadyEarned: false,
        foundingFanNumber: 14,
      }),
      true,
    );
    assert.equal(
      foundingFanBadgeEarned({
        slug: "founder-fan",
        alreadyEarned: false,
        foundingFanNumber: 1,
      }),
      true,
    );
    assert.equal(
      foundingFanBadgeEarned({
        slug: "founding-fan",
        alreadyEarned: false,
        foundingFanNumber: 100,
      }),
      true,
    );
  });

  it("stays locked without a first-100 number and is not Premium-gated", () => {
    assert.equal(
      foundingFanBadgeEarned({
        slug: "founding-fan",
        alreadyEarned: false,
        foundingFanNumber: null,
      }),
      false,
    );
    assert.equal(
      foundingFanBadgeEarned({
        slug: "founding-fan",
        alreadyEarned: false,
        foundingFanNumber: 101,
      }),
      false,
    );
    assert.equal(
      foundingFanBadgeEarned({
        slug: "welcome",
        alreadyEarned: false,
        foundingFanNumber: 14,
      }),
      false,
    );
    assert.equal(
      foundingFanBadgeEarned({
        slug: "founding-fan",
        alreadyEarned: true,
        foundingFanNumber: null,
      }),
      true,
    );
  });
});

describe("award path matches free founding_fan_number counters", () => {
  it("latest claim function awards founding-fan (not Premium-only founding-fan)", () => {
    const claim = readRepo("../../supabase/migrations/0055_founding_fan_free_badge.sql");
    assert.match(claim, /award_community_badge\(p_fan_id,\s*'founding-fan'/);
    assert.match(claim, /tier\s*=\s*'free'|tier\s*=\s*null/);
    assert.match(claim, /founding_fan_number/);
    assert.match(claim, /backfill|fan_community_memberships/i);
  });

  it("onboard awards founding-fan after a successful free claim", () => {
    const onboard = readRepo("../app/api/fan-engage/onboard/route.ts");
    assert.match(onboard, /claim_founding_fan_status/);
    assert.match(onboard, /award_community_badge/);
    assert.match(onboard, /founding-fan/);
  });

  it("badge gallery unlocks Founding Fan from founding_fan_number", () => {
    const badges = readRepo("./data/badges.ts");
    assert.match(badges, /foundingFanBadgeEarned/);
  });
});
