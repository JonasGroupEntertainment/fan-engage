import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FACEBOOK_WINDOW_FEATURES,
  facebookShareUrl,
} from "./facebook-share.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), "utf8");

describe("facebookShareUrl", () => {
  it("wraps a full address in Facebook's share page", () => {
    // Arrange
    const link = "https://www.fanengagepro.com/artists/some-artist";

    // Act
    const result = facebookShareUrl(link);

    // Assert
    assert.equal(
      result,
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fwww.fanengagepro.com%2Fartists%2Fsome-artist",
    );
  });

  it("keeps an invite link whole, including its artist and card", () => {
    const link =
      "https://www.fanengagepro.com/invite/abcdef012345?artist=some-artist&card=%2Fshare%2Ftier%2Fsome-artist";

    const result = facebookShareUrl(link);

    assert.ok(result);
    assert.equal(new URL(result).searchParams.get("u"), link);
    // One parameter only: the link's own "&" must not leak into Facebook's address.
    assert.deepEqual([...new URL(result).searchParams.keys()], ["u"]);
  });

  it("always points at facebook.com, whatever the link says", () => {
    const result = facebookShareUrl(
      "https://evil.example/?u=https://www.facebook.com",
    );

    assert.ok(result);
    assert.equal(new URL(result).origin, "https://www.facebook.com");
    assert.equal(new URL(result).pathname, "/sharer/sharer.php");
  });

  it("returns null for anything that is not a full web address", () => {
    for (const bad of [
      "",
      null,
      undefined,
      "/artists/some-artist",
      "javascript:alert(1)",
      "mailto:a@b.co",
      "not a url",
    ]) {
      assert.equal(facebookShareUrl(bad), null, String(bad));
    }
  });

  it("opens the window with no way back into our page", () => {
    assert.equal(FACEBOOK_WINDOW_FEATURES, "noopener,noreferrer");
  });
});

describe("where the Facebook button is wired", () => {
  const facebookButton = read("../components/facebook-share-button.tsx");

  it("builds its address with facebookShareUrl and opens it safely", () => {
    assert.match(facebookButton, /facebookShareUrl\(/);
    assert.match(
      facebookButton,
      /window\.open\([^)]*"_blank",\s*FACEBOOK_WINDOW_FEATURES\)/,
    );
  });

  it("loads no Facebook script or pixel", () => {
    assert.doesNotMatch(
      facebookButton,
      /connect\.facebook\.net|fbq\(|<script/i,
    );
  });

  it("sends the fan's invite link, the same rule as the Share button", () => {
    assert.match(facebookButton, /inviteShareUrl\(/);
    assert.match(facebookButton, /useInviteCode\(/);
  });

  it("sits beside the Share button and on the Referrals page", () => {
    assert.match(
      read("../components/share-button.tsx"),
      /<FacebookShareButton/,
    );
    assert.match(read("../app/referrals/page.tsx"), /<FacebookShareButton/);
  });
});
