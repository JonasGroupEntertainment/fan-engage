import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const bar = read("../components/mobile-tab-bar.tsx");
const layout = read("../app/layout.tsx");

describe("phone bottom tab bar (BEP #193 port)", () => {
  it("offers Home, Card, Rewards and Artists", () => {
    for (const piece of [
      '{ href: "/", label: "Home"',
      '{ href: "/me/card", label: "Card"',
      '{ href: "/rewards", label: "Rewards"',
      '{ href: "/artists", label: "Artists"',
    ]) {
      assert.ok(bar.includes(piece), piece);
    }
  });

  it("offers Community, lit on an artist's community page with Artists unlit", () => {
    assert.ok(bar.includes('{ href: COMMUNITY_TAB_PATH, label: "Community", icon: "community" }'));
    assert.match(bar, /export const COMMUNITY_TAB_PATH = "\/community";/);
    assert.match(read("../app/community/route.ts"), /\/artists\/\$\{communityId\}\/community/);
    assert.match(bar, /if \(href === COMMUNITY_TAB_PATH && onArtistCommunity\) return true;/);
    assert.match(bar, /if \(href === "\/artists" && onArtistCommunity\) return false;/);
    // The same rule as ARTIST_COMMUNITY_PATH in the component, on real paths.
    const ARTIST_COMMUNITY_PATH = /^\/artists\/[^/]+\/community(\/|$)/;
    assert.ok(ARTIST_COMMUNITY_PATH.test("/artists/raelynn/community"));
    assert.ok(!ARTIST_COMMUNITY_PATH.test("/artists/raelynn"));
    assert.ok(!ARTIST_COMMUNITY_PATH.test("/artists/raelynn/communityx"));
  });

  it("is phone-only and only for signed-in fans", () => {
    assert.match(bar, /fixed inset-x-0 bottom-0 z-40[^"]*md:hidden/);
    assert.match(layout, /\{user && <MobileTabBar \/>\}/);
  });

  it("stays out of admin, the artist portal and the sign-in and sign-up flows", () => {
    for (const path of ["/admin", "/artist-portal", "/login", "/signup", "/onboarding"]) {
      assert.ok(bar.includes(`"${path}"`), path);
    }
  });

  it("floating banners sit above it", () => {
    for (const f of ["../components/cookie-banner.tsx", "../components/install-prompt.tsx", "../components/points-toast.tsx"]) {
      assert.match(read(f), /var\(--tab-bar-h,0px\)/, f);
    }
    assert.match(read("../app/globals.css"), /body:has\(nav\[data-tab-bar\]\)/);
  });
});
