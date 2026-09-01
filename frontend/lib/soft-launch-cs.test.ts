import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const guestSurfaces = {
  homepage: readRepo("../components/signed-out-landing.tsx"),
  foundingBlock: readRepo("../components/founding-fan-block.tsx"),
  community: readRepo("../app/artists/[slug]/community/page.tsx"),
  hubRoom: readRepo("../components/artist-hub-room.tsx"),
  rewards: readRepo("../app/rewards/page.tsx"),
  layout: readRepo("../app/layout.tsx"),
  artistPage: readRepo("../app/artists/[slug]/page.tsx"),
  leaderboardPage: readRepo("../app/artists/[slug]/leaderboard/page.tsx"),
};

describe("soft-launch CS: guest copy and honesty", () => {
  it("guest homepage and community header do not say “in the writer”", () => {
    for (const [name, src] of Object.entries(guestSurfaces)) {
      assert.doesNotMatch(
        src,
        /in the writer/i,
        `${name} still contains “in the writer”`,
      );
    }
    assert.match(guestSurfaces.foundingBlock, /Founding Fans/);
    assert.match(guestSurfaces.foundingBlock, /1\.5× points/);
    assert.match(guestSurfaces.community, /Founding Fans #1–100 earn 1\.5× points/);
    assert.match(guestSurfaces.foundingBlock, /getFoundingFanClaimState|foundingTarget|foundingSpotsRemaining/);
  });

  it("guest /rewards has no Gold-tier theater or preview numbers", () => {
    assert.doesNotMatch(guestSurfaces.rewards, /previewTotalPoints/);
    assert.doesNotMatch(guestSurfaces.rewards, /fallbackBadges/);
    assert.doesNotMatch(guestSurfaces.rewards, /previewCategories/);
    assert.doesNotMatch(guestSurfaces.rewards, /4,200 pts/);
    assert.doesNotMatch(guestSurfaces.rewards, /2,800 pts/);
    assert.doesNotMatch(guestSurfaces.rewards, /3,400 pts/);
    assert.doesNotMatch(guestSurfaces.rewards, /1,050 pts/);
    assert.doesNotMatch(guestSurfaces.rewards, /Preview the fan tier journey/);
    assert.match(guestSurfaces.rewards, /Earn points by showing up/);
    assert.match(guestSurfaces.rewards, /digital unlocks/);
    // Gold copy stays on the signed-in branch only.
    const guestIntro = guestSurfaces.rewards.slice(
      guestSurfaces.rewards.indexOf("Earn points by showing up"),
      guestSurfaces.rewards.indexOf("Badge gallery"),
    );
    assert.doesNotMatch(guestIntro, /Gold/);
    assert.doesNotMatch(guestIntro, /Bronze/);
  });

  it("leaderboard is unlinked from nav and guest artist surfaces", () => {
    assert.doesNotMatch(guestSurfaces.layout, /href:\s*"\/leaderboard"/);
    assert.doesNotMatch(guestSurfaces.layout, /\/artists\/.*leaderboard/);
    assert.doesNotMatch(guestSurfaces.homepage, /\/leaderboard/);
    assert.doesNotMatch(guestSurfaces.artistPage, /LeaderboardMiniCard/);
    assert.doesNotMatch(guestSurfaces.artistPage, /\/leaderboard/);
    assert.match(guestSurfaces.leaderboardPage, /if\s*\(\s*!user\s*\)\s*redirect/);
  });
});
