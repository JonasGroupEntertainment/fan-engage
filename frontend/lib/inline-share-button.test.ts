import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inviteShareUrl, shareTextWithoutUrl } from "./invite-share.ts";
import { sharePayload } from "./share-payload.ts";
import { rewardSharePath } from "./reward-share.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const ORIGIN = "https://www.fanengagepro.com";
const CODE = "abcdef012345";
const REWARD_ID = "a1b2c3d4-2222-3333-4444-555555555555";

describe("what the inline share link sends for a signed-in fan", () => {
  it("a reward card's Share drop becomes the fan's invite link, keeping the reward picture", () => {
    // Arrange: the address the reward card hands the link for a wallpaper.
    const path = rewardSharePath("some-artist", REWARD_ID);

    // Act
    const link = inviteShareUrl({ origin: ORIGIN, url: `${ORIGIN}${path}`, inviteCode: CODE });

    // Assert
    const parsed = new URL(link);
    assert.equal(parsed.pathname, `/invite/${CODE}`);
    assert.equal(parsed.searchParams.get("artist"), "some-artist");
    assert.equal(parsed.searchParams.get("card"), path);
  });

  it("a reward that may not be public shares the artist page, as the fan's invite link", () => {
    const link = inviteShareUrl({ origin: ORIGIN, url: `${ORIGIN}/artists/some-artist`, inviteCode: CODE });

    assert.equal(link, `${ORIGIN}/invite/${CODE}?artist=some-artist`);
  });

  it("the RSVP Bring friends message keeps one link, the invite link", () => {
    const shareUrl = `${ORIGIN}/share/rsvp/some-artist/event-1`;
    const text = `I just RSVPed — come join me: ${shareUrl}`;

    const link = inviteShareUrl({ origin: ORIGIN, url: shareUrl, inviteCode: CODE });
    const payload = sharePayload({ title: "Bring a friend!", text: shareTextWithoutUrl(text, shareUrl), url: link });

    assert.ok(payload.text.startsWith("I just RSVPed"));
    assert.ok(payload.text.endsWith(link));
    assert.ok(!payload.text.includes(shareUrl));
    assert.equal(payload.text.split("http").length - 1, 1);
  });

  it("an address that is already an invite link is left alone", () => {
    const url = `${ORIGIN}/invite/${CODE}?artist=some-artist&event=event-1`;

    assert.equal(inviteShareUrl({ origin: ORIGIN, url, inviteCode: CODE }), url);
  });

  it("a visitor shares the address as it is", () => {
    const url = `${ORIGIN}/artists/some-artist`;

    assert.equal(inviteShareUrl({ origin: ORIGIN, url, inviteCode: null }), url);
  });
});

describe("where the inline share link is wired", () => {
  const button = read("../components/inline-share-button.tsx");

  it("uses the same invite rule and payload as the main Share button", () => {
    assert.match(button, /useInviteCode\(\)/);
    assert.match(button, /inviteShareUrl\(\{ origin: window\.location\.origin, url, inviteCode \}\)/);
    assert.match(button, /navigator\.share\(sharePayload\(\{ title, text: message, url: link \}\)\)/);
  });

  it("copies the invite link, not the bare address, when there is no share sheet", () => {
    assert.match(button, /clipboard\.writeText\(link\)/);
    assert.doesNotMatch(button, /clipboard\.writeText\(url\)/);
  });

  it("still sends a guest to sign up through a real link", () => {
    assert.match(button, /<a href=\{dest\}/);
    assert.match(button, /const dest = href \?\? url;/);
  });

  it("is the link the reward card uses for Share drop", () => {
    assert.match(read("../app/artists/[slug]/rewards/reward-card.tsx"), /<InlineShareButton[\s\S]*?url=\{share\.url\}[\s\S]*?label="↗ Share drop"/);
  });
});
