import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { needsActionHeading } from "./redemption-queue.ts";

describe("redemption queue", () => {
  it("says how many rewards are waiting", () => {
    assert.equal(needsActionHeading(1), "Needs action: 1 reward waiting to be fulfilled or refunded");
    assert.equal(needsActionHeading(3), "Needs action: 3 rewards waiting to be fulfilled or refunded");
  });

  const page = readFileSync(new URL("../../app/admin/redemptions/page.tsx", import.meta.url), "utf8");

  it("the pending count jumps to the list, and each row shows its points", () => {
    assert.match(page, /href="#needs-action"/);
    assert.match(page, /<section id="needs-action"/);
    assert.match(page, /redemption\.point_cost\.toLocaleString\("en-US"\)\} points/);
  });
});
