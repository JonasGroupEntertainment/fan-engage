import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DROP_SHARE_HEADLINE, dropShareCopy, isDropShareItem } from "./drop-share.ts";
import { GUEST_FORBIDDEN_PHRASES } from "./launch-catalog.ts";
import { safeShareCard } from "./invite-share.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("dropShareCopy", () => {
  it("names the artist and nothing from the address", () => {
    // Arrange
    const artistName = "Some Artist";

    // Act
    const copy = dropShareCopy(artistName);

    // Assert
    assert.equal(copy.title, "Exclusive Drop — Some Artist");
    assert.equal(copy.headline, DROP_SHARE_HEADLINE);
    assert.equal(copy.headline, "A new drop");
    assert.equal(copy.shareTitle, "I got early access to a new drop from Some Artist");
    assert.match(copy.description, /a new drop from Some Artist on Fan Engage\.$/);
  });

  it("takes only the artist's name, so typed words have no way in", () => {
    assert.equal(dropShareCopy.length, 1);
  });

  it("uses no phrase that is banned from guest-facing copy", () => {
    const copy = dropShareCopy("Some Artist");
    const text = Object.values(copy).join(" ").toLowerCase();

    for (const phrase of GUEST_FORBIDDEN_PHRASES) {
      assert.ok(!text.includes(phrase.toLowerCase()), phrase);
    }
  });
});

describe("isDropShareItem", () => {
  it("accepts what a drop link looks like", () => {
    for (const ok of ["early-single", "summer_2026", "a", "x".repeat(64)]) {
      assert.equal(isDropShareItem(ok), true, ok);
    }
  });

  it("refuses anything else", () => {
    for (const bad of ["", null, undefined, "two words", "free%20tickets", "a/b", "<b>", "x".repeat(65)]) {
      assert.equal(isDropShareItem(bad), false, String(bad));
    }
  });

  it("agrees with the invite link rule about a drop share page", () => {
    assert.equal(safeShareCard("/share/drop/some-artist/early-single"), "/share/drop/some-artist/early-single");
    assert.equal(isDropShareItem("early-single"), true);
  });
});

describe("the drop share page prints nothing from its address", () => {
  const page = read("../app/share/drop/[slug]/[drop]/page.tsx");
  const picture = read("../app/share/drop/[slug]/[drop]/opengraph-image.tsx");

  it("neither the page nor the picture turns the address into words", () => {
    for (const [name, src] of [["page", page], ["picture", picture]] as const) {
      assert.doesNotMatch(src, /dropLabel/, name);
      assert.doesNotMatch(src, /decodeURIComponent/, name);
      assert.doesNotMatch(src, /toUpperCase\(\)/, name);
    }
  });

  it("both take their words from the fixed copy", () => {
    assert.match(page, /dropShareCopy\(/);
    assert.match(picture, /DROP_SHARE_HEADLINE/);
  });

  it("the page refuses an address that does not look like a drop link", () => {
    assert.match(page, /if \(!artist \|\| !isDropShareItem\(drop\)\) notFound\(\);/);
  });
});
