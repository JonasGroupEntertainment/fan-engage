import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MERCH_COMMUNITY_TAGS,
  filterCommunityTagsForMarketplace,
  isMarketplaceLive,
  isMerchCommunityTag,
  sanitizeCommunityTagFilter,
} from "./marketplace-live.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const chips = readRepo("../app/artists/[slug]/community/tag-filter-chips.tsx");
const communityPage = readRepo("../app/artists/[slug]/community/page.tsx");

describe("isMarketplaceLive", () => {
  it("is off unless NEXT_PUBLIC_MARKETPLACE_LIVE is exactly true", () => {
    assert.equal(isMarketplaceLive({}), false);
    assert.equal(isMarketplaceLive({ NEXT_PUBLIC_MARKETPLACE_LIVE: "false" }), false);
    assert.equal(isMarketplaceLive({ NEXT_PUBLIC_MARKETPLACE_LIVE: "1" }), false);
    assert.equal(isMarketplaceLive({ NEXT_PUBLIC_MARKETPLACE_LIVE: "true" }), true);
  });
});

describe("merch community chips stay gated until merch ships", () => {
  it("treats merch_drop and pre_order as merch-commerce tags", () => {
    assert.deepEqual([...MERCH_COMMUNITY_TAGS], ["merch_drop", "pre_order"]);
    assert.equal(isMerchCommunityTag("merch_drop"), true);
    assert.equal(isMerchCommunityTag("Pre_Order"), true);
    assert.equal(isMerchCommunityTag("fan_art"), false);
    assert.equal(isMerchCommunityTag("release"), false);
  });

  it("hides merch chips for guests and members while marketplace is off", () => {
    const tags = [
      { tag: "live_show", post_count: 4 },
      { tag: "merch_drop", post_count: 2 },
      { tag: "pre_order", post_count: 1 },
      { tag: "fan_art", post_count: 3 },
    ];
    assert.deepEqual(filterCommunityTagsForMarketplace(tags, false), [
      { tag: "live_show", post_count: 4 },
      { tag: "fan_art", post_count: 3 },
    ]);
    assert.deepEqual(filterCommunityTagsForMarketplace(tags, true), tags);
  });

  it("ignores merch ?tag= deep links until merch is live", () => {
    assert.equal(sanitizeCommunityTagFilter("merch_drop", false), null);
    assert.equal(sanitizeCommunityTagFilter("pre_order", false), null);
    assert.equal(sanitizeCommunityTagFilter("fan_art", false), "fan_art");
    assert.equal(sanitizeCommunityTagFilter("merch_drop", true), "merch_drop");
    assert.equal(sanitizeCommunityTagFilter("", false), null);
  });

  it("community feed and chips use the marketplace gate, not a second flag", () => {
    assert.match(communityPage, /filterCommunityTagsForMarketplace/);
    assert.match(communityPage, /sanitizeCommunityTagFilter/);
    assert.match(communityPage, /isMarketplaceLive/);
    assert.match(chips, /filterCommunityTagsForMarketplace/);
    assert.match(chips, /isMarketplaceLive/);
    assert.doesNotMatch(communityPage, /NEXT_PUBLIC_MERCH_CHIPS/);
    assert.doesNotMatch(chips, /NEXT_PUBLIC_MERCH_CHIPS/);
  });
});
