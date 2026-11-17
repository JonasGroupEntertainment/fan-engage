import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Port of Brand Engage Pro #175. The root layout used to set canonical "/"
// for the whole site, so every page without its own value (artist pages,
// /rewards, /signup, /help, the policy pages) told search engines it was a
// copy of the homepage.

const APP_DIR = join(fileURLToPath(new URL("..", import.meta.url)), "app");
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

describe("canonical link per page", () => {
  it("the root layout sets no default canonical for every page to inherit", () => {
    assert.doesNotMatch(read("layout.tsx"), /canonical\s*:/);
  });

  it("the homepage names itself as canonical", () => {
    assert.match(read("page.tsx"), /canonical:\s*"\/"/);
  });

  for (const [file, path] of [
    ["rewards/page.tsx", "/rewards"],
    ["signup/page.tsx", "/signup"],
    ["help/page.tsx", "/help"],
    ["artists/page.tsx", "/artists"],
    ["for-artists/page.tsx", "/for-artists"],
  ] as const) {
    it(`${path} names its own canonical`, () => {
      assert.ok(read(file).includes(`canonical: "${path}"`));
    });
  }

  it("artist pages name /artists/<slug>", () => {
    assert.ok(read("artists/[slug]/page.tsx").includes("canonical: `/artists/${slug}`"));
  });

  it("policy pages derive their canonical from the slug", () => {
    assert.match(read("(legal)/policy-metadata.ts"), /slug\.replace\(\/_\/g, "-"\)/);
  });

  it("sitemap and robots never fall back to the old vercel.app host", () => {
    for (const f of ["sitemap.ts", "robots.ts"]) {
      assert.doesNotMatch(read(f), /fan-engage-pearl\.vercel\.app/);
    }
  });
});
