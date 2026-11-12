import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildInviteLink,
  parseArtistParam,
  resolveOnboardArtist,
  withArtistParam,
} from "./artist-param.ts";
import { signupOnboardingHref } from "../signup-destination.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

describe("parseArtistParam", () => {
  it("normalizes a slug-shaped value", () => {
    assert.equal(parseArtistParam(" RaeLynn "), "raelynn");
    assert.equal(parseArtistParam(["bailee", "blake"]), "bailee");
  });

  it("rejects anything that is not a slug", () => {
    for (const bad of [undefined, null, "", "   ", "-lead", "ra elynn", "a/b", "x".repeat(65), "nellies?x", "<script>"]) {
      assert.equal(parseArtistParam(bad as string), null, JSON.stringify(bad));
    }
  });

  it("has no special-casing for the sister product's slug (it simply never resolves in artists)", () => {
    const src = readRepo("./artist-param.ts").replace(/^\s*\*.*$/gm, "");
    assert.doesNotMatch(src, /["'`]nellies["'`]/);
  });
});

describe("resolveOnboardArtist", () => {
  it("a validated ?artist= wins over ?ref=", () => {
    assert.deepEqual(
      resolveOnboardArtist({ lockedArtist: "bailee", refFromUrl: "a1b2c3", defaultSlug: "raelynn" }),
      { slug: "bailee", source: "artist" },
    );
  });

  it("?ref= keeps its old meaning when there is no artist", () => {
    assert.deepEqual(
      resolveOnboardArtist({ lockedArtist: null, refFromUrl: "blake", defaultSlug: "raelynn" }),
      { slug: "blake", source: "ref" },
    );
  });

  it("falls back to the launch community", () => {
    assert.deepEqual(
      resolveOnboardArtist({ refFromUrl: "", defaultSlug: "raelynn" }),
      { slug: "raelynn", source: "default" },
    );
    assert.deepEqual(
      resolveOnboardArtist({ lockedArtist: "Not A Slug", defaultSlug: "raelynn" }),
      { slug: "raelynn", source: "default" },
    );
  });
});

describe("withArtistParam", () => {
  it("appends to a bare path and to an existing query, keeping the hash", () => {
    assert.equal(withArtistParam("/onboarding", "raelynn"), "/onboarding?artist=raelynn");
    assert.equal(
      withArtistParam("/signup?ref=abc&next=%2Fpremium#top", "bailee"),
      "/signup?ref=abc&next=%2Fpremium&artist=bailee#top",
    );
  });

  it("replaces a stale artist and ignores an invalid one", () => {
    assert.equal(withArtistParam("/onboarding?artist=old", "blake"), "/onboarding?artist=blake");
    assert.equal(withArtistParam("/onboarding?ref=x", null), "/onboarding?ref=x");
    assert.equal(withArtistParam("/onboarding", "bad slug"), "/onboarding");
  });
});

describe("buildInviteLink", () => {
  it("builds /invite/<code> and adds artist + event when known", () => {
    assert.equal(buildInviteLink({ origin: "https://fanengagepro.com/", code: "ab12" }), "https://fanengagepro.com/invite/ab12");
    assert.equal(
      buildInviteLink({ origin: "https://fanengagepro.com", code: "ab12", artistSlug: "raelynn" }),
      "https://fanengagepro.com/invite/ab12?artist=raelynn",
    );
    assert.equal(
      buildInviteLink({ origin: "https://fanengagepro.com", code: "ab12", artistSlug: "raelynn", eventId: "ev 1" }),
      "https://fanengagepro.com/invite/ab12?artist=raelynn&event=ev+1",
    );
  });

  it("drops an invalid artist rather than emitting garbage", () => {
    assert.equal(
      buildInviteLink({ origin: "https://x.test", code: "c", artistSlug: "../etc" }),
      "https://x.test/invite/c",
    );
  });
});

describe("signup → onboarding carries ?artist= independently of ?ref=", () => {
  it("keeps both params through the signup bounce", () => {
    const href = signupOnboardingHref("/onboarding?artist=bailee", "a1b2c3");
    assert.equal(href, "/onboarding?artist=bailee&ref=a1b2c3");
  });

  it("an explicit artist overrides a nested one and an invalid one is dropped", () => {
    assert.equal(signupOnboardingHref("/onboarding?artist=old", "raelynn", "blake"), "/onboarding?artist=blake&ref=raelynn");
    assert.equal(signupOnboardingHref(null, null, "no good"), "/onboarding");
  });

  it("is unchanged for callers that never pass an artist", () => {
    assert.equal(signupOnboardingHref("/premium", "raelynn"), "/onboarding?next=%2Fpremium&ref=raelynn");
  });
});

describe("wiring", () => {
  const page = readRepo("../../app/onboarding/page.tsx");
  const wizard = readRepo("../../app/onboarding/onboarding-wizard.tsx");
  const invite = readRepo("../../app/invite/[code]/page.tsx");

  it("the server page validates ?artist= against active artists before locking", () => {
    assert.match(page, /parseArtistParam\(raw\)/);
    assert.match(page, /\.from\("artists"\)[\s\S]*?\.eq\("active", true\)/);
    assert.match(page, /lockedArtist=\{lockedArtist\}/);
  });

  it("the wizard sends the locked artist as communitySlug and still sends the referral code", () => {
    assert.match(wizard, /resolveOnboardArtist\(\{\s*lockedArtist: lockedArtist\?\.slug/);
    assert.match(wizard, /referralCode: refCode,\s*communitySlug,/);
    assert.doesNotMatch(wizard, /communitySlug: refFromUrl \|\| "raelynn"/);
  });

  it("invite links hand both ref and artist to signup", () => {
    assert.match(invite, /signupParams\.set\("artist", artist\.slug\)/);
  });
});
