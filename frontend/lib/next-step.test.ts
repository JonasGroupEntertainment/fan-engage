import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PREMIUM_REDEEM_NOTE, pickNextStep, type NextStepInput, type NextStepReward } from "./next-step.ts";
import { GUEST_FORBIDDEN_PHRASES } from "./launch-catalog.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

function reward(overrides: Partial<NextStepReward> = {}): NextStepReward {
  return {
    id: "r1",
    title: "Phone Wallpaper",
    point_cost: 250,
    community_id: "some-artist",
    requires_tier: null,
    redeemed: false,
    ...overrides,
  };
}

function input(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    spendablePoints: 100,
    lifetimePoints: 100,
    rewards: [reward()],
    premiumCommunities: ["some-artist"],
    founderCommunities: [],
    tiersHref: "/rewards",
    ...overrides,
  };
}

describe("pickNextStep: a reward still ahead", () => {
  it("names the closest reward and the points left", () => {
    // Arrange
    const rewards = [reward({ id: "far", title: "Fan Spotlight", point_cost: 1000 }), reward()];

    // Act
    const step = pickNextStep(input({ rewards }));

    // Assert
    assert.equal(step?.kind, "reward_ahead");
    assert.equal(step?.title, "Phone Wallpaper");
    assert.equal(step?.line, "150 more points to Phone Wallpaper.");
    assert.equal(step?.percent, 40);
    assert.equal(step?.href, "/artists/some-artist/rewards");
  });

  it("says one point, not one points", () => {
    const step = pickNextStep(input({ spendablePoints: 249 }));

    assert.equal(step?.line, "1 more point to Phone Wallpaper.");
  });

  it("tells a fan without Premium that redeeming needs it", () => {
    const step = pickNextStep(input({ premiumCommunities: [] }));

    assert.equal(step?.line, `150 more points to Phone Wallpaper. ${PREMIUM_REDEEM_NOTE}`);
  });
});

describe("pickNextStep: a reward in reach", () => {
  it("offers the best reward the fan can already afford", () => {
    const rewards = [
      reward(),
      reward({ id: "mid", title: "Lyric Wallpaper", point_cost: 500 }),
      reward({ id: "far", title: "Fan Spotlight", point_cost: 1000 }),
    ];

    const step = pickNextStep(input({ spendablePoints: 600, rewards }));

    assert.equal(step?.kind, "reward_ready");
    assert.equal(step?.title, "Lyric Wallpaper");
    assert.equal(step?.eyebrow, "Ready to redeem");
    assert.equal(step?.cta, "Redeem now");
    assert.equal(step?.percent, 100);
  });

  it("does not say Redeem now to a fan without Premium", () => {
    const step = pickNextStep(input({ spendablePoints: 300, premiumCommunities: [] }));

    assert.equal(step?.kind, "reward_ready");
    assert.equal(step?.eyebrow, "You have the points");
    assert.equal(step?.cta, "See how to redeem");
    assert.match(step?.line ?? "", /Redeeming rewards is part of Premium\.$/);
  });

  it("treats Premium per community, not across artists", () => {
    const step = pickNextStep(input({ spendablePoints: 300, premiumCommunities: ["another-artist"] }));

    assert.equal(step?.cta, "See how to redeem");
  });
});

describe("pickNextStep: rewards it never names", () => {
  it("skips a reward already redeemed", () => {
    const step = pickNextStep(input({ rewards: [reward({ redeemed: true })] }));

    assert.equal(step?.kind, "tier_ahead");
  });

  it("skips a reward with no community, which cannot be redeemed", () => {
    const step = pickNextStep(input({ rewards: [reward({ community_id: null })] }));

    assert.equal(step?.kind, "tier_ahead");
  });

  it("skips a Premium reward for a fan without Premium there", () => {
    const step = pickNextStep(
      input({ rewards: [reward({ requires_tier: "premium" })], premiumCommunities: [] }),
    );

    assert.equal(step?.kind, "tier_ahead");
  });

  it("skips a Founder reward for a fan who is not a Founder there", () => {
    const rewards = [reward({ requires_tier: "founder-only" })];

    assert.equal(pickNextStep(input({ rewards }))?.kind, "tier_ahead");
    assert.equal(pickNextStep(input({ rewards, founderCommunities: ["some-artist"] }))?.kind, "reward_ahead");
  });

  it("skips a reward with no cost or a broken cost", () => {
    const rewards = [reward({ point_cost: 0 }), reward({ id: "nan", point_cost: Number.NaN })];

    assert.equal(pickNextStep(input({ rewards }))?.kind, "tier_ahead");
  });
});

describe("pickNextStep: the next tier", () => {
  it("names the next tier when there is no reward to aim at", () => {
    const step = pickNextStep(input({ rewards: [], lifetimePoints: 500 }));

    assert.equal(step?.kind, "tier_ahead");
    assert.equal(step?.title, "Silver");
    assert.equal(step?.line, "250 more points to Silver.");
    assert.equal(step?.percent, 67);
    assert.equal(step?.href, "/rewards");
  });

  it("measures progress from the tier the fan holds, not from zero", () => {
    // Silver starts at 750 and Gold at 3,500; 2,125 is halfway between.
    const step = pickNextStep(input({ rewards: [], lifetimePoints: 2125 }));

    assert.equal(step?.title, "Gold");
    assert.equal(step?.percent, 50);
  });

  it("uses lifetime points, so spending does not move the tier further away", () => {
    const step = pickNextStep(input({ rewards: [], spendablePoints: 0, lifetimePoints: 700 }));

    assert.equal(step?.line, "50 more points to Silver.");
  });

  it("says nothing at the top tier with no reward to aim at", () => {
    assert.equal(pickNextStep(input({ rewards: [], lifetimePoints: 9000 })), null);
  });
});

describe("pickNextStep: unknown points", () => {
  it("does not guess at a reward when the balance could not be read", () => {
    const step = pickNextStep(input({ spendablePoints: null, lifetimePoints: 100 }));

    assert.equal(step?.kind, "tier_ahead");
  });

  it("says nothing when no points could be read at all", () => {
    assert.equal(pickNextStep(input({ spendablePoints: null, lifetimePoints: null })), null);
  });

  it("treats a negative balance as zero", () => {
    const step = pickNextStep(input({ spendablePoints: -20 }));

    assert.equal(step?.line, "250 more points to Phone Wallpaper.");
    assert.equal(step?.percent, 0);
  });
});

describe("next step copy and wiring", () => {
  it("uses no phrase that is banned from guest-facing copy", () => {
    const steps = [
      pickNextStep(input()),
      pickNextStep(input({ spendablePoints: 300, premiumCommunities: [] })),
      pickNextStep(input({ rewards: [] })),
    ];
    const text = steps.map((s) => `${s?.eyebrow} ${s?.line} ${s?.cta}`).join(" ").toLowerCase();

    for (const phrase of GUEST_FORBIDDEN_PHRASES) {
      assert.ok(!text.includes(phrase.toLowerCase()), phrase);
    }
  });

  it("names no artist in the rules", () => {
    assert.doesNotMatch(read("./next-step.ts"), /raelynn/i);
    assert.doesNotMatch(read("../components/next-step-card.tsx"), /raelynn/i);
  });

  it("Fan Home shows the card from the shared rule, fed by the ledger balance", () => {
    const dashboard = read("../components/fan-home-dashboard.tsx");
    assert.match(dashboard, /<NextStepCard/);
    assert.match(read("../components/next-step-card.tsx"), /pickNextStep\(/);
    assert.match(read("../app/page.tsx"), /lifetimePoints=\{kpis\?\.lifetime_points \?\? null\}/);
  });
});
