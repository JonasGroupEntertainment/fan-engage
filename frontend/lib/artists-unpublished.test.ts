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
      ["danger-twins", "dan-marshall", "hunter-hawkins"],
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
