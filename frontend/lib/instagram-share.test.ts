import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  INSTAGRAM_URL,
  INSTAGRAM_WINDOW_FEATURES,
  instagramSharePlan,
  instagramSteps,
} from "./instagram-share.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), "utf8");

const ORIGIN = "https://www.fanengagepro.com";
const CODE = "abcdef012345";

describe("instagramSharePlan", () => {
  it("copies the fan's invite link and offers the share page's picture", () => {
    // Arrange
    const url = `${ORIGIN}/share/tier/some-artist`;

    // Act
    const plan = instagramSharePlan({ origin: ORIGIN, url, inviteCode: CODE });

    // Assert
    assert.equal(plan.link, `${ORIGIN}/invite/${CODE}?artist=some-artist&card=%2Fshare%2Ftier%2Fsome-artist`);
    assert.equal(plan.picturePath, "/share/tier/some-artist/opengraph-image");
    assert.equal(plan.pictureFileName, "some-artist-picture.png");
  });

  it("offers the artist's picture for an artist page", () => {
    const plan = instagramSharePlan({ origin: ORIGIN, url: `${ORIGIN}/artists/some-artist`, inviteCode: CODE });

    assert.equal(plan.link, `${ORIGIN}/invite/${CODE}?artist=some-artist`);
    assert.equal(plan.picturePath, "/artists/some-artist/opengraph-image");
  });

  it("gives a visitor the page address, still with the picture", () => {
    const url = `${ORIGIN}/artists/some-artist`;

    const plan = instagramSharePlan({ origin: ORIGIN, url, inviteCode: null });

    assert.equal(plan.link, url);
    assert.equal(plan.picturePath, "/artists/some-artist/opengraph-image");
  });

  it("has no picture for a page that is not about an artist", () => {
    for (const url of [`${ORIGIN}/invite/${CODE}`, `${ORIGIN}/fans/someone`, `${ORIGIN}/me/card`]) {
      const plan = instagramSharePlan({ origin: ORIGIN, url, inviteCode: CODE });

      assert.equal(plan.link, url, url);
      assert.equal(plan.picturePath, null, url);
      assert.equal(plan.pictureFileName, null, url);
    }
  });

  it("only ever offers a picture path on our own site", () => {
    const plan = instagramSharePlan({
      origin: ORIGIN,
      url: "https://evil.example/artists/some-artist",
      inviteCode: CODE,
    });

    assert.ok(plan.picturePath?.startsWith("/"));
    assert.ok(!plan.picturePath?.startsWith("//"));
  });
});

describe("instagramSteps", () => {
  it("has four steps with a picture and three without", () => {
    assert.equal(instagramSteps({ hasPicture: true, linkCopied: true }).length, 4);
    assert.equal(instagramSteps({ hasPicture: false, linkCopied: true }).length, 3);
  });

  it("does not claim the link is copied when the copy failed", () => {
    const steps = instagramSteps({ hasPicture: true, linkCopied: false });

    assert.doesNotMatch(steps.join(" "), /is copied/);
    assert.match(steps[0], /Copy your link/);
  });

  it("always ends with the Link sticker, which is what makes the link tappable", () => {
    for (const hasPicture of [true, false]) {
      const steps = instagramSteps({ hasPicture, linkCopied: true });
      assert.match(steps[steps.length - 1], /Link, and paste/);
    }
  });
});

describe("where the Instagram button is wired", () => {
  const button = read("../components/instagram-share-button.tsx");

  it("opens Instagram at its own address, with no way back into our page", () => {
    assert.equal(new URL(INSTAGRAM_URL).origin, "https://www.instagram.com");
    assert.equal(INSTAGRAM_WINDOW_FEATURES, "noopener,noreferrer");
    assert.match(button, /window\.open\(INSTAGRAM_URL,\s*"_blank",\s*INSTAGRAM_WINDOW_FEATURES\)/);
  });

  it("loads no Meta script or pixel", () => {
    assert.doesNotMatch(button, /connect\.facebook\.net|fbq\(|<script|instagram\.com\/embed/i);
  });

  it("uses the shared plan, so it sends the same link as the Share button", () => {
    assert.match(button, /instagramSharePlan\(/);
    assert.match(button, /useInviteCode\(/);
  });

  it("sits beside the Share button and on the Referrals page", () => {
    assert.match(read("../components/share-button.tsx"), /<InstagramShareButton/);
    assert.match(read("../app/referrals/page.tsx"), /<InstagramShareButton/);
  });
});
