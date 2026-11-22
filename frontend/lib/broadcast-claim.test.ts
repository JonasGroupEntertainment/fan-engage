import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOTHING_SENT_SUFFIX, broadcastClaimDescription, releasedClaimDescription } from "./broadcast-claim.ts";

const START = "x".repeat(60);

describe("broadcastClaimDescription", () => {
  it("names the tier and channel", () => {
    assert.ok(broadcastClaimDescription("gold", "email", "Hello").startsWith("Tier: gold \u00b7 Channel: email \u00b7 ref "));
  });

  it("is the same for the same send", () => {
    assert.equal(broadcastClaimDescription("gold", "email", "Hello"), broadcastClaimDescription("gold", "email", "Hello"));
  });

  it("differs for two messages that start alike, so the second is not refused", () => {
    assert.notEqual(
      broadcastClaimDescription("all", "sms", `${START} doors at 7`),
      broadcastClaimDescription("all", "sms", `${START} doors at 8`),
    );
  });

  it("differs by tier and by channel", () => {
    assert.notEqual(broadcastClaimDescription("gold", "email", "Hello"), broadcastClaimDescription("silver", "email", "Hello"));
    assert.notEqual(broadcastClaimDescription("gold", "email", "Hello"), broadcastClaimDescription("gold", "both", "Hello"));
  });
});

describe("releasedClaimDescription", () => {
  it("no longer matches the claim, so a send that reached nobody can be tried again at once", () => {
    const claim = broadcastClaimDescription("gold", "email", "Hello");
    assert.notEqual(releasedClaimDescription(claim), claim);
    assert.ok(releasedClaimDescription(claim).endsWith(NOTHING_SENT_SUFFIX));
  });
});
