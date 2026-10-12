import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FOUNDING_FAN_RULE,
  isLegacyFoundingCopy,
  publicFoundingFanDescription,
} from "./founding-fan-rule.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("one Founding Fan rule", () => {
  it("is first-100 free, not a July 15 window or paid pricing", () => {
    assert.match(FOUNDING_FAN_RULE, /first 100/i);
    assert.match(FOUNDING_FAN_RULE, /numbered badge and 1\.5× points, plus 48-hour early RSVP/i);
    assert.match(FOUNDING_FAN_RULE, /not a Premium purchase/i);
    assert.doesNotMatch(FOUNDING_FAN_RULE, /July/);
    assert.equal(isLegacyFoundingCopy("before July 15, 2026"), true);
    assert.equal(isLegacyFoundingCopy("locked-in pricing for life"), true);
    assert.equal(isLegacyFoundingCopy(FOUNDING_FAN_RULE), false);
    assert.equal(
      publicFoundingFanDescription(
        "Joined Fan Engage during the founding window (before July 15, 2026).",
      ),
      FOUNDING_FAN_RULE,
    );
  });

  it("premium welcome matches the Oct 12 Founding Fan policy", () => {
    const welcome = readRepo("../app/premium/welcome/page.tsx");
    assert.match(
      welcome,
      /Founding Fan is a free badge with 1\.5× points while your account stays active\./,
    );
    assert.match(welcome, /Premium is billed at the rate shown at checkout\./);
    assert.doesNotMatch(welcome, /locked-in pricing/i);
    assert.doesNotMatch(welcome, /locked in/i);
    assert.doesNotMatch(welcome, /paying fans/i);
    assert.match(welcome, /founding_fan_number/);
    assert.doesNotMatch(welcome, /founder_number/);
    assert.doesNotMatch(welcome, /claim_founder_slot/);
    assert.doesNotMatch(welcome, /tier === "founder"/);
  });

  it("/rewards states the one rule and has no pre-Jul 15 contradiction", () => {
    const rewards = readRepo("../app/rewards/page.tsx");
    assert.match(rewards, /FOUNDING_FAN_RULE|first 100/);
    assert.doesNotMatch(rewards, /July 15/);
    assert.doesNotMatch(rewards, /pre-?Jul/i);
    assert.doesNotMatch(rewards, /locked-in pricing/i);
    assert.doesNotMatch(rewards, /paying fans/i);
  });

  it("gallery overlays founding descriptions so stale DB copy cannot leak", () => {
    const badges = readRepo("./data/badges.ts");
    assert.match(badges, /publicFoundingFanDescription|FOUNDING_FAN_RULE/);
  });
});
