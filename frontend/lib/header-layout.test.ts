import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// The full menu (seven links) plus the buttons on the right needs about
// 1,250px for a signed-in admin. From 768px it ran off the right edge.
describe("header fits at tablet width", () => {
  const desktop = read("../components/desktop-nav.tsx");
  const mobile = read("../components/mobile-nav.tsx");
  const layout = read("../app/layout.tsx");

  it("shows the full menu only where it fits, and the menu button below that", () => {
    assert.match(desktop, /<nav className="hidden [^"]*xl:flex"/);
    assert.doesNotMatch(desktop, /md:flex/);
    assert.doesNotMatch(mobile, /md:hidden/);
    assert.equal(mobile.match(/xl:hidden/g)?.length, 3);
  });

  it("lets the search box shrink instead of pushing the row wider", () => {
    assert.match(layout, /<div className="hidden min-w-0 max-w-xs flex-1 md:block">/);
  });

  it("does not show the Premium badge beside the Admin button", () => {
    assert.match(layout, /\{!isAdmin && \(\s*<span className="hidden sm:inline-flex">\s*<PremiumBadge/);
  });
});
