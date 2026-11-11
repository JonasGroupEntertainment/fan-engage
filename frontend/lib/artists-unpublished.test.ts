import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  getArtist,
  isUnpublishedArtistSlug,
  listArtists,
  listArtistRecords,
  UNPUBLISHED_ARTIST_SLUGS,
} from "./artists.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

describe("unpublished artist hubs", () => {
  it("404s Danger Twins, Dan Marshall, and Hunter Hawkins instead of serving placeholders", () => {
    assert.deepEqual(
      [...UNPUBLISHED_ARTIST_SLUGS],
      ["danger-twins", "dan-marshall", "hunter-hawkins", "bailee", "bailee-madison", "dan"],
    );
    for (const slug of UNPUBLISHED_ARTIST_SLUGS) {
      assert.equal(isUnpublishedArtistSlug(slug), true);
      assert.equal(getArtist(slug), null);
    }
    assert.equal(getArtist("raelynn")?.name, "RaeLynn");
    const publicSlugs = listArtists().map((a) => a.slug);
    assert.equal(publicSlugs.includes("raelynn"), true);
    assert.equal(publicSlugs.includes("danger-twins"), false);
    assert.equal(publicSlugs.includes("dan-marshall"), false);
    assert.equal(publicSlugs.includes("hunter-hawkins"), false);
    const records = listArtistRecords().map((a) => a.slug);
    assert.equal(records.includes("danger-twins"), true);
  });

  it("does not fall back to hardcoded bios for those slugs", () => {
    const loader = readRepo("./data/artists.ts");
    assert.match(loader, /isUnpublishedArtistSlug\(normalized\)\) return null/);
    assert.match(loader, /listFallbackArtists/);
    const forArtists = readRepo("../app/for-artists/page.tsx");
    assert.match(forArtists, /See a live fan experience/);
    assert.match(forArtists, /Country, heart-first\./);
    assert.match(forArtists, /AI drafts a reply in your tone/);
    assert.doesNotMatch(forArtists, /On tour with Luke Bryan/);
    assert.doesNotMatch(forArtists, /Claude/);
    assert.doesNotMatch(forArtists, /danger-twins/);
    assert.doesNotMatch(forArtists, /dan-marshall/);
    assert.doesNotMatch(forArtists, /hunter-hawkins/);
    assert.match(forArtists, /\/artists\/raelynn/);
  });
});

// Kevin, 2026-11-11: "All bailee items are on hold and should not be public."
describe("Bailee is on hold", () => {
  it("serves no public hub for either Bailee slug", () => {
    for (const slug of ["bailee", "bailee-madison", "Bailee", "BAILEE-MADISON"]) {
      assert.equal(isUnpublishedArtistSlug(slug), true);
      assert.equal(getArtist(slug), null);
    }
    const publicSlugs = listArtists().map((a) => a.slug);
    assert.equal(publicSlugs.includes("bailee"), false);
    assert.equal(publicSlugs.includes("bailee-madison"), false);
  });

  it("keeps the records for admin use, since the work is paused and not dropped", () => {
    const records = listArtistRecords().map((a) => a.slug);
    assert.equal(records.includes("bailee"), true);
    assert.equal(records.includes("bailee-madison"), true);
  });
});

// Kevin, 2026-11-11: "Konnor items can be deleted. We no longer work with him."
describe("Konnor is removed", () => {
  it("has no artist record at all", () => {
    assert.equal(getArtist("konnor"), null);
    assert.equal(listArtistRecords().some((a) => a.slug === "konnor"), false);
    assert.equal(listArtists().some((a) => a.slug === "konnor"), false);
  });

  for (const rel of [
    "./artists.ts",
    "../app/admin/community/seed/actions.ts",
    "../app/admin/influencers/page.tsx",
    "./digest/summarize.ts",
  ]) {
    it(`${rel} does not name him`, () => {
      assert.doesNotMatch(readRepo(rel), /konnor/i);
    });
  }

  it("the digest prompt does not use Bailee as an example either", () => {
    assert.doesNotMatch(readRepo("./digest/summarize.ts"), /bailee/i);
  });
});

// Kevin, 2026-11-11: hide the old "dan" placeholder. Dan Marshall
// (dan-marshall) is the real artist and is next in line to launch.
describe("the dan placeholder is hidden", () => {
  it("serves no public hub for dan, and Dan Marshall stays unpublished too", () => {
    for (const slug of ["dan", "Dan", "dan-marshall"]) {
      assert.equal(isUnpublishedArtistSlug(slug), true);
      assert.equal(getArtist(slug), null);
    }
    assert.equal(listArtists().some((a) => a.slug === "dan"), false);
  });

  it("does not hide artists whose slug only starts with dan", () => {
    assert.equal(isUnpublishedArtistSlug("dana"), false);
    assert.equal(isUnpublishedArtistSlug("danger"), false);
  });
});
