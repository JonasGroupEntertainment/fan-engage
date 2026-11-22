import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CARD_PARAM,
  SHARE_KINDS_WITH_PICTURE,
  invitePreviewImagePath,
  inviteShareUrl,
  isInviteCode,
  safeShareCard,
  shareCardArtist,
  shareContextFromUrl,
  shareTextWithoutUrl,
} from "./invite-share.ts";
import { ARTIST_PARAM, buildInviteLink } from "./onboarding/artist-param.ts";

const filePath = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string) => readFileSync(filePath(rel), "utf8");
const ORIGIN = "https://www.fanengagepro.com";
const CODE = "a1b2c3d4e5f6";
const DASH = "\u2014";

describe("isInviteCode", () => {
  it("accepts a 12 character lowercase hex code only", () => {
    assert.equal(isInviteCode(CODE), true);
    assert.equal(isInviteCode("A1B2C3D4E5F6"), false);
    assert.equal(isInviteCode("a1b2"), false);
    assert.equal(isInviteCode("a1b2c3d4e5f6/../x"), false);
    assert.equal(isInviteCode(""), false);
    assert.equal(isInviteCode(null), false);
    assert.equal(isInviteCode(undefined), false);
  });

  it("matches how fans.referral_code is made", () => {
    const init = read("../../supabase/migrations/0001_init.sql");
    assert.match(init, /referral_code\s+text unique default encode\(gen_random_bytes\(6\), 'hex'\)/);
  });
});

describe("safeShareCard", () => {
  it("accepts our own share pages", () => {
    assert.equal(safeShareCard("/share/tier/raelynn"), "/share/tier/raelynn");
    assert.equal(safeShareCard("/share/badge/raelynn/founder-fan"), "/share/badge/raelynn/founder-fan");
    assert.equal(safeShareCard("/share/founder/raelynn/12"), "/share/founder/raelynn/12");
    assert.equal(safeShareCard("/share/rank/raelynn/3"), "/share/rank/raelynn/3");
    assert.equal(safeShareCard("/share/drop/raelynn/early-single"), "/share/drop/raelynn/early-single");
    assert.equal(
      safeShareCard("/share/rsvp/raelynn/11111111-2222-4333-8444-555555555555"),
      "/share/rsvp/raelynn/11111111-2222-4333-8444-555555555555",
    );
  });

  it("refuses anything that could point somewhere else", () => {
    assert.equal(safeShareCard("https://evil.example/share/tier/x"), null);
    assert.equal(safeShareCard("/share/tier/../../admin"), null);
    assert.equal(safeShareCard("/admin"), null);
    assert.equal(safeShareCard("/share/other/raelynn"), null);
    assert.equal(safeShareCard("//evil.example"), null);
    assert.equal(safeShareCard("/share/tier/RaeLynn"), null);
    assert.equal(safeShareCard("/share/badge/raelynn/a/b"), null);
    assert.equal(safeShareCard("/share/badge/raelynn/a%2Fb"), null);
    assert.equal(safeShareCard("/share/tier/raelynn?x=1"), null);
    assert.equal(safeShareCard(null), null);
    assert.equal(safeShareCard(undefined), null);
  });

  it("refuses a share page with the wrong number of parts", () => {
    assert.equal(safeShareCard("/share/tier/raelynn/extra"), null);
    assert.equal(safeShareCard("/share/badge/raelynn"), null);
  });
});

describe("shareCardArtist", () => {
  it("names the artist a share page belongs to", () => {
    assert.equal(shareCardArtist("/share/tier/raelynn"), "raelynn");
    assert.equal(shareCardArtist("/share/badge/dan-marshall/founder-fan"), "dan-marshall");
    assert.equal(shareCardArtist("/admin"), null);
  });
});

describe("shareContextFromUrl", () => {
  it("reads the artist and the share page from a share address", () => {
    assert.deepEqual(shareContextFromUrl(`${ORIGIN}/share/badge/raelynn/founder-fan`), {
      artist: "raelynn",
      card: "/share/badge/raelynn/founder-fan",
    });
  });

  it("reads the artist from an artist page", () => {
    assert.deepEqual(shareContextFromUrl(`${ORIGIN}/artists/raelynn`), { artist: "raelynn", card: null });
    assert.deepEqual(shareContextFromUrl("/artists/raelynn/leaderboard"), { artist: "raelynn", card: null });
  });

  it("keeps the artist but no picture for a share page that is not on the list", () => {
    assert.deepEqual(shareContextFromUrl(`${ORIGIN}/share/goal/raelynn/abc-123`), {
      artist: "raelynn",
      card: null,
    });
  });

  it("finds nothing on other pages", () => {
    assert.deepEqual(shareContextFromUrl(`${ORIGIN}/fans/abc`), { artist: null, card: null });
    assert.deepEqual(shareContextFromUrl("not a url at all"), { artist: null, card: null });
    assert.deepEqual(shareContextFromUrl(""), { artist: null, card: null });
  });
});

describe("inviteShareUrl", () => {
  it("turns a share page into the fan's invite link, keeping the context", () => {
    assert.equal(
      inviteShareUrl({ origin: ORIGIN, url: `${ORIGIN}/share/tier/raelynn`, inviteCode: CODE }),
      `${ORIGIN}/invite/${CODE}?artist=raelynn&card=%2Fshare%2Ftier%2Fraelynn`,
    );
  });

  it("keeps the artist for an artist page, in the same form the rest of the app builds", () => {
    const link = inviteShareUrl({ origin: `${ORIGIN}/`, url: `${ORIGIN}/artists/raelynn`, inviteCode: CODE });
    assert.equal(link, `${ORIGIN}/invite/${CODE}?artist=raelynn`);
    assert.equal(link, buildInviteLink({ origin: ORIGIN, code: CODE, artistSlug: "raelynn" }));
  });

  it("leaves an address alone when the invite page cannot stand in for it", () => {
    // A fan profile, the fan card and anything else with no artist are
    // shared as they are, even by a signed-in fan with a good code.
    for (const url of [`${ORIGIN}/fans/some-fan`, `${ORIGIN}/me/card`, `${ORIGIN}/rewards`, "https://example.com/x"]) {
      assert.equal(inviteShareUrl({ origin: ORIGIN, url, inviteCode: CODE }), url);
    }
  });

  it("leaves the address alone for a visitor with no invite code", () => {
    const url = `${ORIGIN}/share/tier/raelynn`;
    assert.equal(inviteShareUrl({ origin: ORIGIN, url, inviteCode: null }), url);
    assert.equal(inviteShareUrl({ origin: ORIGIN, url, inviteCode: undefined }), url);
    assert.equal(inviteShareUrl({ origin: ORIGIN, url, inviteCode: "nope" }), url);
  });

  it("leaves an address alone when it is already an invite link", () => {
    // The artist page builds the fan's invite link on the server, with the
    // artist and sometimes an event on it. Rebuilding it would drop those.
    const url = `${ORIGIN}/invite/${CODE}?artist=raelynn&event=11111111-2222-4333-8444-555555555555`;
    assert.equal(inviteShareUrl({ origin: ORIGIN, url, inviteCode: CODE }), url);
  });

  it("uses the parameter names sign-up and the invite page already read", () => {
    assert.equal(ARTIST_PARAM, "artist");
    assert.equal(CARD_PARAM, "card");
  });
});

describe("shareTextWithoutUrl", () => {
  const url = `${ORIGIN}/share/tier/raelynn`;

  it("takes the old address out of the message", () => {
    assert.equal(shareTextWithoutUrl(`I'm a Premium fan for RaeLynn. ${url}`, url), "I'm a Premium fan for RaeLynn.");
    assert.equal(shareTextWithoutUrl(`Join me: ${url}`, url), "Join me:");
  });

  it("takes a dash left hanging at the end with it", () => {
    assert.equal(shareTextWithoutUrl(`Earned on Fan Engage ${DASH} ${url}`, url), "Earned on Fan Engage");
  });

  it("leaves other text alone", () => {
    assert.equal(shareTextWithoutUrl("Come join me.", `${ORIGIN}/x`), "Come join me.");
    assert.equal(shareTextWithoutUrl(`Top fan ${DASH} can you beat me?`, url), `Top fan ${DASH} can you beat me?`);
    assert.equal(shareTextWithoutUrl("Come join me.", ""), "Come join me.");
  });
});

describe("invitePreviewImagePath", () => {
  it("prefers the share picture, then the artist picture", () => {
    assert.equal(
      invitePreviewImagePath({ artist: "raelynn", card: "/share/tier/raelynn" }),
      "/share/tier/raelynn/opengraph-image",
    );
    assert.equal(invitePreviewImagePath({ artist: "raelynn", card: null }), "/artists/raelynn/opengraph-image");
    assert.equal(invitePreviewImagePath({ artist: null, card: null }), null);
  });
});

describe("preview pictures exist", () => {
  const PICTURE_FILE = "opengraph-image.tsx";
  const SHARE_DIR = "../app/share";

  /** Whether a share kind's page has a picture file beside it, at any depth. */
  const hasPicture = (dir: string): boolean =>
    readdirSync(dir, { withFileTypes: true }).some((entry) =>
      entry.isDirectory() ? hasPicture(`${dir}/${entry.name}`) : entry.name === PICTURE_FILE,
    );

  it("every share kind on the list has an opengraph-image file", () => {
    for (const kind of SHARE_KINDS_WITH_PICTURE) {
      const dir = filePath(`${SHARE_DIR}/${kind}`);
      assert.ok(existsSync(dir) && hasPicture(dir), `no picture for ${kind}`);
    }
  });

  it("every share kind on disk with a picture is on the list", () => {
    const onDisk = readdirSync(filePath(SHARE_DIR), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && hasPicture(filePath(`${SHARE_DIR}/${entry.name}`)))
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(onDisk, [...SHARE_KINDS_WITH_PICTURE].sort());
  });

  it("the tier picture sits right under the artist, the others one level down", () => {
    assert.ok(existsSync(filePath(`${SHARE_DIR}/tier/[slug]/${PICTURE_FILE}`)));
    for (const kind of SHARE_KINDS_WITH_PICTURE.filter((k) => k !== "tier")) {
      assert.equal(existsSync(filePath(`${SHARE_DIR}/${kind}/[slug]/${PICTURE_FILE}`)), false, kind);
    }
  });

  it("artist pages have one", () => {
    assert.ok(existsSync(filePath(`../app/artists/[slug]/${PICTURE_FILE}`)));
  });
});

describe("wiring", () => {
  it("the share button sends the invite link for a signed-in fan", () => {
    const button = read("../components/share-button.tsx");
    assert.match(button, /useInviteCode\(\)/);
    assert.match(button, /inviteShareUrl\(/);
    assert.match(button, /shareTextWithoutUrl\(/);
  });

  it("the share button works the link out before it opens the share sheet, with no wait between", () => {
    const button = read("../components/share-button.tsx");
    const handler = button.slice(button.indexOf("async function handleShare"));
    const shareCall = handler.indexOf("await navigator.share(");
    assert.ok(shareCall > 0);
    const beforeShare = handler.slice(0, shareCall);
    assert.ok(beforeShare.includes("inviteShareUrl("));
    assert.doesNotMatch(beforeShare, /\bawait\b/);
  });

  it("the invite code is the fan's own row, read again when the signed-in fan changes", () => {
    const hook = read("../components/use-invite-code.ts");
    assert.match(hook, /\.from\("fans"\)/);
    assert.match(hook, /\.select\("referral_code"\)/);
    assert.match(hook, /\.eq\("id", user\.id\)/);
    assert.match(hook, /isInviteCode\(/);
    assert.match(hook, /onAuthStateChange\(/);
    // The auth client must not be called from inside its own change handler.
    const handler = hook.slice(hook.indexOf("onAuthStateChange("));
    assert.match(handler, /setTimeout\(load, 0\)/);
  });

  it("the invite page only uses an artist and picture it has checked", () => {
    const page = read("../app/invite/[code]/page.tsx");
    assert.match(page, /parseArtistParam\(/);
    assert.match(page, /safeShareCard\(/);
    assert.match(page, /shareCardArtist\(/);
    assert.match(page, /getArtistFromDb\(/);
    assert.doesNotMatch(page, /searchParams: Promise<\{ artist\?: string \}>/);
  });

  it("the invite page is kept out of search results", () => {
    const page = read("../app/invite/[code]/page.tsx");
    assert.match(page, /robots: \{ index: false, follow: false \}/);
  });

  it("the invite page still makes the same points promise", () => {
    const page = read("../app/invite/[code]/page.tsx");
    assert.match(page, /earn your first 100 points/);
    assert.match(page, /with 100 bonus points for you/);
    assert.equal(page.split("earns 150 points after you finish joining").length - 1, 2);
  });
});
