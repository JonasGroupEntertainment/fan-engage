import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_COMMUNITY_SLUG,
  communityPath,
  communitySignupHref,
  pickViewerCommunity,
  resolveDefaultCommunitySlug,
} from "./community-default.ts";
import { LAUNCH_COMMUNITY_ID } from "./launch-catalog.ts";
import { RAELYNN_COMMUNITY_PATH } from "./legacy-path-redirects.ts";
import { guestSignupHref } from "./guest-signup.ts";
import { merchGuestSignupHref } from "./entitlements-core.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("DEFAULT_COMMUNITY_SLUG — single source of truth", () => {
  it("falls back to the launch community when no env override is set", () => {
    assert.equal(resolveDefaultCommunitySlug({}), "raelynn");
    assert.equal(resolveDefaultCommunitySlug({ DEFAULT_COMMUNITY_SLUG: "" }), "raelynn");
  });

  it("honours a well-formed env override (public key wins over server key)", () => {
    assert.equal(resolveDefaultCommunitySlug({ DEFAULT_COMMUNITY_SLUG: "Danger-Twins " }), "danger-twins");
    assert.equal(
      resolveDefaultCommunitySlug({
        NEXT_PUBLIC_DEFAULT_COMMUNITY_SLUG: "hunter-hawkins",
        DEFAULT_COMMUNITY_SLUG: "danger-twins",
      }),
      "hunter-hawkins",
    );
  });

  it("rejects malformed overrides instead of producing a broken slug", () => {
    assert.equal(resolveDefaultCommunitySlug({ DEFAULT_COMMUNITY_SLUG: "../etc" }), "raelynn");
    assert.equal(resolveDefaultCommunitySlug({ DEFAULT_COMMUNITY_SLUG: "has space" }), "raelynn");
  });

  it("is what every legacy default alias resolves to", () => {
    assert.equal(LAUNCH_COMMUNITY_ID, DEFAULT_COMMUNITY_SLUG);
    assert.equal(RAELYNN_COMMUNITY_PATH, `/artists/${DEFAULT_COMMUNITY_SLUG}/community`);
    assert.equal(
      guestSignupHref({}),
      `/signup?ref=${DEFAULT_COMMUNITY_SLUG}&next=%2Fonboarding`,
    );
    assert.equal(
      merchGuestSignupHref(),
      `/signup?ref=${DEFAULT_COMMUNITY_SLUG}&next=%2Fmarketplace`,
    );
    assert.equal(merchGuestSignupHref("danger-twins"), "/signup?ref=danger-twins&next=%2Fmarketplace");
  });

  it("resolves the viewer community: host-if-member → first membership → host → default", () => {
    assert.equal(pickViewerCommunity({ memberSlugs: ["danger-twins", "raelynn"], hostSlug: "raelynn" }), "raelynn");
    assert.equal(pickViewerCommunity({ memberSlugs: ["danger-twins"], hostSlug: "raelynn" }), "danger-twins");
    assert.equal(pickViewerCommunity({ memberSlugs: [], hostSlug: "hunter-hawkins" }), "hunter-hawkins");
    assert.equal(pickViewerCommunity({ memberSlugs: [], hostSlug: null }), DEFAULT_COMMUNITY_SLUG);
  });

  it("builds community paths and signup doors from a slug", () => {
    assert.equal(communityPath("danger-twins"), "/artists/danger-twins");
    assert.equal(communityPath("danger-twins", "rewards"), "/artists/danger-twins/rewards");
    assert.equal(communitySignupHref("danger-twins"), "/signup?ref=danger-twins");
    assert.equal(
      communitySignupHref("danger-twins", "/rewards"),
      "/signup?ref=danger-twins&next=%2Frewards",
    );
  });

  it("is the only place the launch slug literal lives among the default plumbing", () => {
    // lib/community.ts keeps the subdomain map (data), nothing else.
    const communityTs = readRepo("./community.ts");
    assert.doesNotMatch(communityTs, /DEFAULT_COMMUNITY_ID\s*=\s*"raelynn"/);
    assert.match(communityTs, /DEFAULT_COMMUNITY_ID: string = DEFAULT_COMMUNITY_SLUG/);
    for (const rel of [
      "./launch-catalog.ts",
      "./legacy-path-redirects.ts",
      "./guest-signup.ts",
      "./entitlements-core.ts",
      "./points/award.ts",
      "./streaks/touch.ts",
      "../app/rewards/page.tsx",
      "../app/recap/page.tsx",
      "../app/layout.tsx",
      "../components/mobile-nav.tsx",
      "../components/preview-signup-banner.tsx",
      "../components/marketplace-coming-soon.tsx",
      "../components/fan-home-dashboard.tsx",
      "../components/founding-fan-block.tsx",
      "../components/signed-out-landing.tsx",
    ]) {
      assert.doesNotMatch(readRepo(rel), /["'`/]raelynn["'`/&?]/, `${rel} still hard-codes raelynn`);
    }
  });
});

describe("Brand Engage Pro communities never leak into Fan Engage", () => {
  it("has no nellies reference in the host map, latest strip, or fan import", () => {
    for (const rel of [
      "./community.ts",
      "./community-default.ts",
      "../components/latest-strip.tsx",
      "../app/admin/fans/import/page.tsx",
      "../app/admin/fans/import/actions.ts",
    ]) {
      assert.doesNotMatch(readRepo(rel), /nellies/i, `${rel} references the BEP brand community`);
    }
  });

  it("loads fan-import targets from the communities table, not a hard-coded list", () => {
    const page = readRepo("../app/admin/fans/import/page.tsx");
    assert.doesNotMatch(page, /const COMMUNITIES\s*=/);
    assert.match(page, /listImportCommunitiesAction/);
  });
});
