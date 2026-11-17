import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("Fan Card link opens the fan's profile (BEP #191 port)", () => {
  it("the card links to /fans/<profile handle>, falling back to the id", () => {
    const card = read("../app/me/card/page.tsx");
    assert.match(card, /profileSlug \?\? fan\.id/);
    assert.doesNotMatch(card, /fan-engage-pearl\.vercel\.app/);
  });
  it("the profile page accepts a fan id as well as a handle", () => {
    const profile = read("./data/fan-profile.ts");
    assert.match(profile, /looksLikeFanId\(normalized\)\s*\?\s*base\.eq\("id", normalized\)/);
  });
});
