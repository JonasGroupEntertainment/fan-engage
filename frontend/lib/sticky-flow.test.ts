import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("sticky-flow: forgot-password HOLD", () => {
  it("server page 404s when the door is closed; form is not the route default", () => {
    const page = readRepo("../app/forgot-password/page.tsx");
    assert.match(page, /if\s*\(\s*!isForgotPasswordEnabled\(\)\s*\)\s*notFound\(\)/);
    assert.doesNotMatch(page, /"use client"/);
    const doors = readRepo("./auth-doors.ts");
    assert.match(
      doors,
      /HOLD: recovery email is PKCE[\s\S]*return false;/,
    );
  });

  it("does not add a /magic-link page", () => {
    const magic = fileURLToPath(new URL("../app/magic-link/page.tsx", import.meta.url));
    assert.equal(existsSync(magic), false);
  });

  it("production /reset-password is not a public set-password form", () => {
    const page = readRepo("../app/reset-password/page.tsx");
    assert.match(page, /if\s*\(\s*!isForgotPasswordEnabled\(\)\s*\)\s*notFound\(\)/);
    assert.doesNotMatch(page, /"use client"/);
  });
});

describe("sticky-flow: marketplace guest digital path", () => {
  it("guest marketplace points at digital redeem, not an empty merch-only wall", () => {
    const soon = readRepo("../components/marketplace-coming-soon.tsx");
    const market = readRepo("../app/marketplace/page.tsx");
    const rewards = readRepo("../app/rewards/page.tsx");
    assert.match(soon, /\/artists\/raelynn\/rewards/);
    assert.match(soon, /Join to redeem digital unlocks/);
    assert.match(soon, /merch coming soon/i);
    assert.match(market, /guestDigitalTeasers/);
    assert.match(market, /Phone Wallpaper/);
    assert.match(market, /Lyric Wallpaper/);
    assert.match(rewards, /Redeem digital unlocks/);
    assert.match(rewards, /href:\s*"\/artists\/raelynn\/rewards"/);
    assert.doesNotMatch(soon, /jgos\.io/);
    assert.doesNotMatch(market, /jgos\.io/);
  });
});

describe("sticky-flow: Bring friends is a real CTA", () => {
  it("guest artist events link Join to bring friends at signup", () => {
    const artist = readRepo("../app/artists/[slug]/page.tsx");
    const share = readRepo("../components/inline-share-button.tsx");
    assert.match(share, /<a href=\{dest\}/);
    assert.doesNotMatch(share, /<button type="button"/);
    assert.match(artist, /Join to bring friends/);
    assert.match(artist, /\/signup\?ref=/);
    assert.doesNotMatch(artist, /jgos\.io/);
  });
});
