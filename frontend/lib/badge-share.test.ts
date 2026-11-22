import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { badgeShare, badgeShareArtist } from "./badge-share.ts";
import { inviteShareUrl, safeShareCard, shareTextWithoutUrl } from "./invite-share.ts";
import { GUEST_FORBIDDEN_PHRASES } from "./launch-catalog.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const APP_URL = "https://www.fanengagepro.com";

describe("badgeShareArtist", () => {
  it("uses the artist the badge is recorded against when the fan follows them and they are live", () => {
    assert.equal(badgeShareArtist("second-artist", ["first-artist", "second-artist"]), "second-artist");
  });

  it("falls back to the first live artist the fan follows", () => {
    assert.equal(badgeShareArtist("not-followed", ["first-artist", "second-artist"]), "first-artist");
    assert.equal(badgeShareArtist(null, ["first-artist"]), "first-artist");
  });

  it("gives nothing when the fan follows no live artist", () => {
    assert.equal(badgeShareArtist("first-artist", []), null);
    assert.equal(badgeShareArtist("first-artist", ["../x", "Two Words"]), null);
  });
});

describe("badgeShare", () => {
  const base = { artistSlug: "some-artist", appUrl: APP_URL };

  it("shares the badge's own share page with a line that names only the badge", () => {
    // Arrange
    const badge = { slug: "first-comment", name: "First comment" };

    // Act
    const share = badgeShare({ ...base, badge });

    // Assert
    assert.deepEqual(share, {
      url: `${APP_URL}/share/badge/some-artist/first-comment`,
      title: "First comment badge on Fan Engage",
      text: `The First comment badge, earned on Fan Engage. ${APP_URL}/share/badge/some-artist/first-comment`,
    });
  });

  it("takes no fan name and no artist name, so neither can end up in the message", () => {
    const share = badgeShare({ ...base, badge: { slug: "welcome", name: "Welcome aboard" } });
    const words = `${share?.title} ${shareTextWithoutUrl(share?.text ?? "", share?.url ?? "")}`;

    assert.equal(badgeShare.length, 1);
    assert.doesNotMatch(words, /some-artist|some artist/i);
    assert.doesNotMatch(words, /\bI\b|\bmy\b/i);
  });

  it("builds an address the invite link rule accepts as a share page with a picture", () => {
    const share = badgeShare({ ...base, badge: { slug: "founding-fan", name: "Founding Fan" } });

    assert.ok(share);
    assert.equal(safeShareCard(new URL(share.url).pathname), "/share/badge/some-artist/founding-fan");
  });

  it("becomes the sharer's invite link with one link in the message", () => {
    const share = badgeShare({ ...base, badge: { slug: "welcome", name: "Welcome aboard" } });
    assert.ok(share);

    const link = inviteShareUrl({ origin: APP_URL, url: share.url, inviteCode: "abcdef012345" });
    const message = shareTextWithoutUrl(share.text, share.url);

    assert.equal(new URL(link).pathname, "/invite/abcdef012345");
    assert.equal(new URL(link).searchParams.get("artist"), "some-artist");
    assert.equal(new URL(link).searchParams.get("card"), "/share/badge/some-artist/welcome");
    assert.equal(message, "The Welcome aboard badge, earned on Fan Engage.");
  });

  it("gives no share when something could not go in an address safely, or the name is missing", () => {
    for (const slug of ["", "../admin", "two words", "UPPER", "a/b"]) {
      assert.equal(badgeShare({ ...base, badge: { slug, name: "Badge" } }), null, slug);
    }
    assert.equal(badgeShare({ ...base, artistSlug: null, badge: { slug: "welcome", name: "Welcome" } }), null);
    assert.equal(badgeShare({ ...base, artistSlug: "../x", badge: { slug: "welcome", name: "Welcome" } }), null);
    assert.equal(badgeShare({ ...base, badge: { slug: "welcome", name: "  " } }), null);
  });

  it("uses no phrase that is banned from guest-facing copy", () => {
    const share = badgeShare({ ...base, badge: { slug: "welcome", name: "Welcome aboard" } });
    const text = `${share?.title} ${share?.text}`.toLowerCase();

    for (const phrase of GUEST_FORBIDDEN_PHRASES) {
      assert.ok(!text.includes(phrase.toLowerCase()), phrase);
    }
  });
});

describe("where badge sharing is wired", () => {
  const profile = read("../app/fans/[slug]/page.tsx");
  const rewards = read("../app/rewards/page.tsx");

  it("the profile shows Share under each earned badge, under a live artist the fan follows", () => {
    const badges = profile.slice(profile.indexOf("Badges earned"));
    assert.match(badges, /badgeShare\(\{/);
    assert.match(profile, /badgeShareArtist\(/);
    assert.match(badges, /<ShareButton[\s\S]*?label="Share"/);
    assert.match(read("./data/fan-profile.ts"), /earned_at, community_id, badges!inner/);
    assert.match(read("./data/fan-profile.ts"), /artists!inner \( slug, name, active \)/);
  });

  it("the Rewards gallery shows Share only under an unlocked badge, for a signed-in fan", () => {
    assert.match(rewards, /badgeShare\(\{/);
    assert.match(rewards, /badge\.earned && isSignedIn/);
    assert.match(rewards, /<ShareButton[\s\S]*?label="Share"/);
  });

  it("neither place puts the fan's name in the share", () => {
    assert.doesNotMatch(profile.slice(profile.indexOf("badgeShare({")).slice(0, 300), /displayName|firstName/);
    assert.doesNotMatch(rewards.slice(rewards.indexOf("badgeShare({")).slice(0, 300), /first_name|firstName/);
  });
});
