import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const helperSrc = readRepo("./founding-fans.ts");
const landingStatsSrc = readRepo("./landing-stats.ts");
const goalsSrc = readRepo("./goals.ts");
const artistPageSrc = readRepo("../../app/artists/[slug]/page.tsx");
const premiumPageSrc = readRepo("../../app/premium/page.tsx");
const founderSlotsApiSrc = readRepo("../../app/api/founder-slots/route.ts");
const checkoutSrc = readRepo("../../app/premium/actions.ts");
const founderSlotsUiSrc = readRepo("../../app/premium/founder-slots-counter.tsx");
const foundersWallSrc = readRepo("../../app/artists/[slug]/founders/page.tsx");

describe("guest founding counters share one source", () => {
  it("helper query is founding_fan_number 1 through FOUNDING_FAN_CAP", () => {
    const queryFn = helperSrc.slice(
      helperSrc.indexOf("export async function getFoundingFanClaimState"),
    );
    assert.match(helperSrc, /foundingClaimStateFromCount/);
    assert.match(queryFn, /founding_fan_number/);
    assert.match(queryFn, /gte\("founding_fan_number"/);
    assert.match(queryFn, /lte\("founding_fan_number"/);
    assert.match(helperSrc, /listFoundingFans/);
    assert.doesNotMatch(queryFn, /is_founder/);
    assert.doesNotMatch(queryFn, /founder_cap/);
  });

  it("homepage, artist campaign, and /premium read getFoundingFanClaimState", () => {
    assert.match(landingStatsSrc, /getFoundingFanClaimState/);
    assert.match(goalsSrc, /getFoundingFanClaimState/);
    assert.match(artistPageSrc, /getCampaignGoals/);
    assert.match(premiumPageSrc, /getFoundingFanClaimState/);
    assert.match(founderSlotsApiSrc, /getFoundingFanClaimState/);
    assert.match(foundersWallSrc, /getFoundingFanClaimState/);
    assert.match(foundersWallSrc, /listFoundingFans/);
    assert.doesNotMatch(foundersWallSrc, /is_founder/);
    assert.doesNotMatch(foundersWallSrc, /getFounderState/);
    assert.match(premiumPageSrc, /Free Founding Fan badge/);
    assert.match(premiumPageSrc, /Premium is a separate paid plan/);
    assert.doesNotMatch(premiumPageSrc, /Founding Fan pricing/);
    assert.doesNotMatch(founderSlotsUiSrc, /founding pricing/);

    assert.doesNotMatch(landingStatsSrc, /is_founder/);
    assert.doesNotMatch(landingStatsSrc, /\.not\("founding_fan_number"/);
    assert.doesNotMatch(artistPageSrc, /is_founder/);
    assert.doesNotMatch(artistPageSrc, /getFounderCount/);
    assert.doesNotMatch(artistPageSrc, /getFounderState/);
    assert.doesNotMatch(premiumPageSrc, /getFounderState/);
    assert.doesNotMatch(founderSlotsApiSrc, /getFounderState/);
    assert.doesNotMatch(goalsSrc, /live\.founderCount/);
  });

  it("premium slot UI remaining is cap minus claimed", () => {
    assert.match(
      founderSlotsUiSrc,
      /remaining:\s*Math\.max\(0,\s*total\s*-\s*initialFilled\)/,
    );
  });

  it("checkout still uses paid is_founder eligibility separately", () => {
    assert.match(checkoutSrc, /getFounderState/);
  });

  it("founders wall never calls free joiners paying fans or locked-in pricing", () => {
    assert.doesNotMatch(foundersWallSrc, /paying fans/i);
    assert.doesNotMatch(foundersWallSrc, /locked-in pricing/i);
    assert.doesNotMatch(foundersWallSrc, /premium founders/i);
    assert.match(foundersWallSrc, /Free badge for the first/);
    assert.match(foundersWallSrc, /Not a paid purchase/);
    assert.match(foundersWallSrc, /Premium \(\$10\/mo or \$99\/yr\) is a\s+separate plan/);
  });
});
