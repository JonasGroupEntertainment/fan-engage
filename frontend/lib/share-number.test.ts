import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shareNumber } from "./share-number.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("shareNumber", () => {
  it("reads a plain positive number", () => {
    assert.equal(shareNumber("1"), 1);
    assert.equal(shareNumber("42"), 42);
    assert.equal(shareNumber("9999999"), 9999999);
  });

  it("refuses a number followed by typed words, which parseInt would accept", () => {
    for (const bad of ["1 anything here", "5abc", "3%20free%20tickets", "7<b>", "2-for-1"]) {
      assert.equal(shareNumber(bad), null, bad);
    }
  });

  it("refuses everything that is not a plain positive number", () => {
    for (const bad of ["", null, undefined, "0", "-1", "01", "1.5", "1e3", "first", " 1", "12345678"]) {
      assert.equal(shareNumber(bad), null, String(bad));
    }
  });
});

describe("the rank and founder share pages print nothing typed into their address", () => {
  const files = {
    rankPage: read("../app/share/rank/[slug]/[rank]/page.tsx"),
    rankPicture: read("../app/share/rank/[slug]/[rank]/opengraph-image.tsx"),
    founderPage: read("../app/share/founder/[slug]/[number]/page.tsx"),
    founderPicture: read("../app/share/founder/[slug]/[number]/opengraph-image.tsx"),
  };

  it("all four read the number strictly, and none uses parseInt", () => {
    for (const [name, src] of Object.entries(files)) {
      assert.match(src, /shareNumber\(/, name);
      assert.doesNotMatch(src, /parseInt\(/, name);
    }
  });

  it("the rank picture never falls back to the raw address", () => {
    assert.doesNotMatch(files.rankPicture, /: routeParams\.rank;/);
  });

  it("no page title or address is built from the raw value", () => {
    assert.doesNotMatch(files.rankPage, /\$\{rank\}/);
    assert.doesNotMatch(files.founderPage, /\$\{number\}/);
  });
});
