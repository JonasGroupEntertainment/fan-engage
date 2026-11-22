import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Source-level checks that the two admin screens that write to one
 * artist's fans (Broadcast, campaign builder) email only the chosen fans.
 * The rules are unit-tested in audience-email*.test.ts; these pin the
 * wiring so a refactor cannot quietly bring back the whole-audience
 * Mailchimp campaign.
 */
function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const SCREENS = ["../app/admin/broadcast/actions.ts", "../app/admin/campaigns/actions.ts"] as const;

describe("admin audience email wiring", () => {
  for (const screen of SCREENS) {
    it(`${screen} emails through the per-fan path, never the whole-audience campaign`, () => {
      const src = readRepo(screen);
      assert.doesNotMatch(src, /broadcastEmail/);
      assert.match(src, /sendAudienceEmail\(/);
      assert.match(src, /hasRecentCampaign\(/);
    });
  }

  it("the per-fan path sends through Mandrill only and pages its reads", () => {
    const src = readRepo("./admin-audience.ts");
    assert.match(src, /sendMandrillBatch\(/);
    assert.doesNotMatch(src, /sendTransactionalBatch|broadcastEmail|api\.mailchimp\.com/);
    assert.match(src, /pageAll</);
    assert.match(src, /pageAllIn</);
  });

  it("the Broadcast screen texts the same chosen fans it emails", () => {
    const src = readRepo("../app/admin/broadcast/actions.ts");
    assert.match(src, /broadcastSms\(\{[^}]*fanIds/);
  });

  it("text recipients are read a page at a time", () => {
    const src = readRepo("./broadcast.ts");
    assert.match(src, /pageAllIn<RecipientRow, string>/);
  });
});
