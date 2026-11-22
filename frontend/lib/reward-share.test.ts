import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_SHARE_REWARD_TITLES,
  SHARE_PAGE_PREMIUM_NOTE,
  isRewardId,
  isRewardShareable,
  pointsLabel,
  rewardShareAddress,
  rewardShareMessages,
  rewardShareCopy,
  rewardSharePath,
  type ShareableRewardFields,
} from "./reward-share.ts";
import { CARD_PARAM, inviteShareUrl, safeShareCard, SHARE_KINDS_WITH_PICTURE } from "./invite-share.ts";
import { GUEST_FORBIDDEN_PHRASES, LAUNCH_COMMUNITY_ID, LAUNCH_REWARD_TITLES } from "./launch-catalog.ts";

const fileUrl = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string) => readFileSync(fileUrl(rel), "utf8");

const NOW = new Date("2026-11-22T18:00:00Z");
const REWARD_ID = "a1b2c3d4-2222-3333-4444-555555555555";
const APP_URL = "https://www.fanengagepro.com";
const ARTIST = LAUNCH_COMMUNITY_ID;

function reward(overrides: Partial<ShareableRewardFields> = {}): ShareableRewardFields {
  return {
    id: REWARD_ID,
    community_id: ARTIST,
    title: "Phone Wallpaper",
    active: true,
    requires_tier: null,
    stock: null,
    drops_at: null,
    expires_at: null,
    clip_url: null,
    ...overrides,
  };
}

const forArtist = { artistSlug: ARTIST, now: NOW };

describe("which rewards may be public", () => {
  it("is exactly the two wallpapers", () => {
    assert.deepEqual([...PUBLIC_SHARE_REWARD_TITLES], ["Phone Wallpaper", "Lyric Wallpaper"]);
  });

  it("shows each wallpaper", () => {
    for (const title of PUBLIC_SHARE_REWARD_TITLES) {
      assert.equal(isRewardShareable(reward({ title }), forArtist), true, title);
    }
  });

  it("never shows any other launch reward, Fan Spotlight above all", () => {
    const others = LAUNCH_REWARD_TITLES.filter(
      (title) => !(PUBLIC_SHARE_REWARD_TITLES as readonly string[]).includes(title),
    );
    assert.ok(others.includes("Fan Spotlight"));
    for (const title of others) {
      const withClip = reward({ title, clip_url: "https://example.com/clip.mp4" });
      assert.equal(isRewardShareable(withClip, forArtist), false, title);
    }
  });

  it("never shows a reward that is not on the launch list", () => {
    for (const title of ["Meet & Greet Pass", "Signed Physical Merch", "Phone Wallpaper Deluxe"]) {
      assert.equal(isRewardShareable(reward({ title }), forArtist), false, title);
    }
  });
});

describe("isRewardShareable: state of the reward", () => {
  it("does not show a reward that is switched off", () => {
    assert.equal(isRewardShareable(reward({ active: false }), forArtist), false);
  });

  it("does not show another artist's reward, or one with no artist", () => {
    assert.equal(isRewardShareable(reward({ community_id: "other-artist" }), forArtist), false);
    assert.equal(isRewardShareable(reward({ community_id: null }), forArtist), false);
    assert.equal(isRewardShareable(reward(), { artistSlug: "other-artist", now: NOW }), false);
  });

  it("does not show a reward marked to stay inside the app", () => {
    assert.equal(isRewardShareable(reward({ in_app_only: true }), forArtist), false);
    assert.equal(isRewardShareable(reward({ in_app_only: false }), forArtist), true);
  });

  it("does not show a tier-only reward", () => {
    assert.equal(isRewardShareable(reward({ requires_tier: "premium" }), forArtist), false);
    assert.equal(isRewardShareable(reward({ requires_tier: "founder-only" }), forArtist), false);
  });

  it("does not show a reward that is out of stock", () => {
    assert.equal(isRewardShareable(reward({ stock: 0 }), forArtist), false);
    assert.equal(isRewardShareable(reward({ stock: -1 }), forArtist), false);
    assert.equal(isRewardShareable(reward({ stock: 5 }), forArtist), true);
  });

  it("does not show a drop before it opens or a reward that has ended", () => {
    assert.equal(isRewardShareable(reward({ drops_at: "2026-11-23T00:00:00Z" }), forArtist), false);
    assert.equal(isRewardShareable(reward({ drops_at: "2026-11-21T00:00:00Z" }), forArtist), true);
    assert.equal(isRewardShareable(reward({ expires_at: "2026-11-22T18:00:00Z" }), forArtist), false);
    assert.equal(isRewardShareable(reward({ expires_at: "2026-12-01T00:00:00Z" }), forArtist), true);
  });

  it("refuses a missing reward, a bad id or a bad artist slug", () => {
    assert.equal(isRewardShareable(null, forArtist), false);
    assert.equal(isRewardShareable(reward({ id: "phone-wallpaper" }), forArtist), false);
    assert.equal(isRewardShareable(reward({ community_id: "../x" }), { artistSlug: "../x", now: NOW }), false);
  });

  it("accepts a uuid as an id and nothing else", () => {
    assert.equal(isRewardId(REWARD_ID), true);
    for (const bad of ["", null, undefined, "../admin", `${REWARD_ID}/x`, REWARD_ID.toUpperCase()]) {
      assert.equal(isRewardId(bad), false, String(bad));
    }
  });
});

describe("rewardShareAddress", () => {
  it("is the reward's share page for a wallpaper", () => {
    const address = rewardShareAddress({ appUrl: `${APP_URL}/`, artistSlug: ARTIST, reward: reward(), now: NOW });

    assert.equal(address, `${APP_URL}/share/reward/${ARTIST}/${REWARD_ID}`);
  });

  it("falls back to the artist page for any other reward, or none", () => {
    const artistPage = `${APP_URL}/artists/${ARTIST}`;
    const spotlight = reward({ title: "Fan Spotlight" });

    assert.equal(rewardShareAddress({ appUrl: APP_URL, artistSlug: ARTIST, reward: spotlight, now: NOW }), artistPage);
    assert.equal(rewardShareAddress({ appUrl: APP_URL, artistSlug: ARTIST, reward: null, now: NOW }), artistPage);
  });
});

describe("rewardShareMessages: what a fan's share says", () => {
  const base = { appUrl: APP_URL, artistSlug: ARTIST, artistName: "Some Artist", now: NOW };
  const everyText = (m: ReturnType<typeof rewardShareMessages>) =>
    [m.redeemedTitle, m.redeemedText, m.browseTitle, m.browseText, m.url].join(" ");

  it("names a wallpaper and links to its share page", () => {
    // Arrange
    const wallpaper = { ...reward(), point_cost: 250 };

    // Act
    const messages = rewardShareMessages({ ...base, reward: wallpaper });

    // Assert
    assert.equal(messages.namesReward, true);
    assert.equal(messages.url, `${APP_URL}/share/reward/${ARTIST}/${REWARD_ID}`);
    assert.equal(messages.redeemedTitle, "I just redeemed Phone Wallpaper on Fan Engage");
    assert.equal(
      messages.redeemedText,
      `Cashed in 250 points for Phone Wallpaper from Some Artist's fan experience. ${messages.url}`,
    );
    assert.equal(messages.browseTitle, "Phone Wallpaper");
    assert.equal(messages.browseText, "Check out this drop on Fan Engage: Phone Wallpaper for 250 points.");
  });

  it("never names Fan Spotlight, and links to the artist's page", () => {
    const spotlight = { ...reward({ title: "Fan Spotlight" }), point_cost: 1000 };

    const messages = rewardShareMessages({ ...base, reward: spotlight });

    assert.equal(messages.namesReward, false);
    assert.equal(messages.url, `${APP_URL}/artists/${ARTIST}`);
    assert.doesNotMatch(everyText(messages), /spotlight/i);
    assert.equal(messages.redeemedTitle, "I just redeemed a fan reward on Fan Engage");
    assert.match(messages.redeemedText, /^Cashed in my points for a fan reward from Some Artist's fan experience\. /);
  });

  it("never names any launch reward that is not a wallpaper", () => {
    const others = LAUNCH_REWARD_TITLES.filter(
      (title) => !(PUBLIC_SHARE_REWARD_TITLES as readonly string[]).includes(title),
    );
    for (const title of others) {
      const row = { ...reward({ title, clip_url: "https://example.com/clip.mp4" }), point_cost: 500 };
      const messages = rewardShareMessages({ ...base, reward: row });

      assert.equal(messages.namesReward, false, title);
      assert.ok(!everyText(messages).includes(title), title);
    }
  });

  it("does not name a wallpaper that is switched off or out of stock", () => {
    for (const overrides of [{ active: false }, { stock: 0 }]) {
      const row = { ...reward(overrides), point_cost: 250 };
      const messages = rewardShareMessages({ ...base, reward: row });

      assert.equal(messages.namesReward, false);
      assert.doesNotMatch(everyText(messages), /wallpaper/i);
    }
  });

  it("uses no phrase that is banned from guest-facing copy", () => {
    const named = rewardShareMessages({ ...base, reward: { ...reward(), point_cost: 250 } });
    const generic = rewardShareMessages({ ...base, reward: { ...reward({ title: "Fan Spotlight" }), point_cost: 1000 } });
    const text = `${everyText(named)} ${everyText(generic)}`.toLowerCase();

    for (const phrase of GUEST_FORBIDDEN_PHRASES) {
      assert.ok(!text.includes(phrase.toLowerCase()), phrase);
    }
  });
});

describe("the reward share page works with the invite link", () => {
  const path = rewardSharePath(ARTIST, REWARD_ID);

  it("is a share page with a picture", () => {
    assert.ok((SHARE_KINDS_WITH_PICTURE as readonly string[]).includes("reward"));
    assert.equal(safeShareCard(path), path);
    assert.ok(existsSync(fileUrl("../app/share/reward/[slug]/[reward]/opengraph-image.tsx")));
    assert.ok(existsSync(fileUrl("../app/share/reward/[slug]/[reward]/page.tsx")));
  });

  it("becomes the fan's invite link, keeping the artist and the reward picture", () => {
    const link = inviteShareUrl({ origin: APP_URL, url: `${APP_URL}${path}`, inviteCode: "abcdef012345" });
    const parsed = new URL(link);

    assert.equal(parsed.pathname, "/invite/abcdef012345");
    assert.equal(parsed.searchParams.get("artist"), ARTIST);
    assert.equal(parsed.searchParams.get(CARD_PARAM), path);
  });
});

describe("copy", () => {
  it("writes points in words a fan reads", () => {
    assert.equal(pointsLabel(500), "500 points");
    assert.equal(pointsLabel(1), "1 point");
    assert.equal(pointsLabel(1500), "1,500 points");
    assert.equal(pointsLabel(Number.NaN), "0 points");
  });

  it("names the reward and the artist, and no fan", () => {
    const copy = rewardShareCopy({ rewardTitle: "Phone Wallpaper", artistName: "Some Artist", pointCost: 250 });

    assert.equal(copy.title, "Phone Wallpaper · Some Artist");
    assert.match(copy.description, /Phone Wallpaper is a fan reward from Some Artist for 250 points/);
  });

  it("uses no phrase that is banned from guest-facing copy", () => {
    const copy = rewardShareCopy({ rewardTitle: "Phone Wallpaper", artistName: "Some Artist", pointCost: 250 });
    const page = read("../app/share/reward/[slug]/[reward]/page.tsx").toLowerCase();
    const text = `${copy.title} ${copy.description} ${SHARE_PAGE_PREMIUM_NOTE}`.toLowerCase();

    for (const phrase of GUEST_FORBIDDEN_PHRASES) {
      assert.ok(!text.includes(phrase.toLowerCase()), phrase);
      assert.ok(!page.includes(phrase.toLowerCase()), `page: ${phrase}`);
    }
  });
});

describe("where the reward share page is wired", () => {
  it("the page and the picture both load the reward through the shareable check", () => {
    for (const file of ["page.tsx", "opengraph-image.tsx"]) {
      assert.match(read(`../app/share/reward/[slug]/[reward]/${file}`), /getShareableReward\(/, file);
    }
    assert.match(read("./data/reward-share.ts"), /isRewardShareable\(/);
    assert.match(read("./data/reward-share.ts"), /isRewardId\(/);
  });

  it("the public page never prints the reward's stored description", () => {
    assert.doesNotMatch(read("../app/share/reward/[slug]/[reward]/page.tsx"), /reward\.description/);
    assert.doesNotMatch(read("./data/reward-share.ts"), /SHARE_COLUMNS =\s*"[^"]*description/);
    assert.match(read("./data/reward-share.ts"), /in_app_only/);
  });

  it("the page says that redeeming is part of Premium", () => {
    assert.match(read("../app/share/reward/[slug]/[reward]/page.tsx"), /SHARE_PAGE_PREMIUM_NOTE/);
  });

  it("the page is refreshed every ten minutes and the picture is not cached for long", () => {
    const page = read("../app/share/reward/[slug]/[reward]/page.tsx");
    assert.match(page, /export const dynamic = "force-static";/);
    assert.match(page, /export const revalidate = 600;/);
    assert.match(read("../app/share/reward/[slug]/[reward]/opengraph-image.tsx"), /max-age=600, s-maxage=600/);
  });

  it("the rewards page gives each card its share messages, and both share buttons use them", () => {
    assert.match(read("../app/artists/[slug]/rewards/page.tsx"), /rewardShareMessages\(/);
    const form = read("../app/artists/[slug]/rewards/redeem-form.tsx");
    assert.match(form, /title=\{share\.redeemedTitle\}/);
    assert.match(form, /text=\{share\.redeemedText\}/);
    assert.match(form, /url=\{share\.url\}/);
    const card = read("../app/artists/[slug]/rewards/reward-card.tsx");
    assert.match(card, /title=\{share\.browseTitle\}/);
    assert.match(card, /text=\{share\.browseText\}/);
  });

  it("neither share button builds its own wording from the reward's name", () => {
    const form = read("../app/artists/[slug]/rewards/redeem-form.tsx");
    const card = read("../app/artists/[slug]/rewards/reward-card.tsx");
    assert.doesNotMatch(form, /I just redeemed \$\{/);
    assert.doesNotMatch(form, /Cashed in/);
    assert.doesNotMatch(card, /Check out this drop/);
  });

  it("the signed-in-only listing rule is untouched", () => {
    assert.match(read("./launch-catalog.ts"), /if \(!opts\.signedIn\) return false;/);
  });
});
