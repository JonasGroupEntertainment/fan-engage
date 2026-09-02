import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LAUNCH_COMMUNITY_ID } from "./launch-catalog.ts";
import { resolveOnboardCommunityId } from "./onboard-community.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("resolveOnboardCommunityId defaults to RaeLynn", () => {
  it("uses raelynn when slug and referral are missing", () => {
    assert.equal(resolveOnboardCommunityId({}), LAUNCH_COMMUNITY_ID);
    assert.equal(resolveOnboardCommunityId({ communitySlug: "", referralCode: null }), "raelynn");
    assert.equal(resolveOnboardCommunityId({ communitySlug: "   " }), "raelynn");
  });

  it("keeps an explicit community slug", () => {
    assert.equal(
      resolveOnboardCommunityId({ communitySlug: "raelynn" }),
      "raelynn",
    );
  });

  it("treats a fan referral code as not a community and falls back to raelynn", () => {
    assert.equal(
      resolveOnboardCommunityId({
        communitySlug: "a1b2c3",
        referralCode: "a1b2c3",
        knownCommunitySlugs: ["raelynn"],
      }),
      "raelynn",
    );
  });

  it("does not skip join when the ref looks like a slug but is unknown", () => {
    assert.equal(
      resolveOnboardCommunityId({
        referralCode: "not-a-community",
        knownCommunitySlugs: ["raelynn"],
      }),
      "raelynn",
    );
  });
});

describe("onboard always joins RaeLynn then claims founding", () => {
  const onboard = readRepo("../app/api/fan-engage/onboard/route.ts");
  const wizard = readRepo("../app/onboarding/onboarding-wizard.tsx");

  it("resolves a community even without a payload slug", () => {
    assert.match(onboard, /resolveOnboardCommunityId/);
    assert.match(onboard, /LAUNCH_COMMUNITY_ID|raelynn/);
    assert.doesNotMatch(
      onboard,
      /if\s*\(\s*\/\^\[a-z0-9-\]\+\$\/\.test\(candidateSlug\)\)/,
    );
  });

  it("upserts fan_community_memberships before claim_founding_fan_status", () => {
    const joinAt = onboard.indexOf("fan_community_memberships");
    const claimAt = onboard.indexOf("claim_founding_fan_status");
    assert.ok(joinAt > 0 && claimAt > joinAt, "membership upsert must precede founding claim");
    assert.match(onboard, /community_id:\s*joinSlug/);
  });

  it("wizard defaults communitySlug to raelynn when ref is missing", () => {
    assert.match(wizard, /communitySlug:/);
    assert.match(wizard, /raelynn/);
  });
});
