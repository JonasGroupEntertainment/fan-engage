import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Exclusive digital drops are "Coming soon" on /premium. The invite page
// must not promise them to a new fan as if they were live.
const here = dirname(fileURLToPath(import.meta.url));
const invitePage = readFileSync(
  join(here, "..", "app", "invite", "[code]", "page.tsx"),
  "utf8",
);

test("invite page does not promise early digital drops", () => {
  assert.doesNotMatch(invitePage, /early digital drops/i);
});

test("invite page still offers the 100 bonus points and inviter credit", () => {
  assert.match(invitePage, /100 bonus points for you/);
  assert.match(invitePage, /earns 150 points after you finish joining/);
});
