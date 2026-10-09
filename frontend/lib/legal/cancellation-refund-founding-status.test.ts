import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyCancellationFoundingStatus,
  CANCELLATION_REFUND_EFFECTIVE_DATE,
  CANCELLATION_REFUND_UPDATED_AT,
  FOUNDING_FAN_STATUS_SECTION,
} from "./cancellation-refund-founding-status.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const LIVE_PAGE = [
  "# Cancellation & Refund Policy",
  "## 1. Cancelling your subscription",
  "You can cancel your Fan Engage subscription at any time from your account settings. Cancellation takes effect at the end of the current billing period — you keep Premium access until then.",
  "## 2. Refunds",
  "Fan Engage does not offer refunds for partial billing periods. If you believe you were charged in error, contact support@fanengagepro.com within 30 days of the charge and we will investigate.",
  "## 3. Founding Fan pricing",
  "Founding Fan pricing is locked in for the lifetime of your continuous subscription. If you cancel and later re-subscribe, you will be billed at the then-current standard rate; the founder slot is not held for returning fans.",
  "## 4. Disputes",
  "Before initiating a chargeback with your card issuer, please contact support@fanengagepro.com so we can resolve the issue directly. Chargebacks without prior contact may result in account suspension.",
  "## 5. Changes to this policy",
  "We may update this policy from time to time. The effective date at the top of this page reflects the most recent revision.",
].join("\r\n\r\n");

describe("cancellation refund section 3", () => {
  it("replaces Founding Fan pricing and leaves the other sections", () => {
    const next = applyCancellationFoundingStatus(LIVE_PAGE);
    assert.match(next, /## 3\. Founding Fan status/);
    assert.match(next, /free badge offered to the first 100 fans/);
    assert.match(next, /does not change the price of Premium/);
    assert.match(next, /1\.5× points/);
    assert.doesNotMatch(next, /Founding Fan pricing/);
    assert.doesNotMatch(next, /locked in for the lifetime/);
    assert.match(next, /## 1\. Cancelling your subscription/);
    assert.match(next, /## 2\. Refunds/);
    assert.match(next, /does not offer refunds for partial billing periods/);
    assert.match(next, /## 4\. Disputes/);
    assert.match(next, /## 5\. Changes to this policy/);
    assert.match(next, /support@fanengagepro\.com/);
  });

  it("is idempotent once the new section is present", () => {
    const once = applyCancellationFoundingStatus(LIVE_PAGE);
    assert.equal(applyCancellationFoundingStatus(once), once);
    assert.equal(
      applyCancellationFoundingStatus(FOUNDING_FAN_STATUS_SECTION),
      FOUNDING_FAN_STATUS_SECTION,
    );
  });

  it("uses 12 October 2026 as the ship-date placeholder", () => {
    assert.equal(CANCELLATION_REFUND_EFFECTIVE_DATE.slice(0, 10), "2026-10-12");
    assert.equal(CANCELLATION_REFUND_UPDATED_AT.slice(0, 10), "2026-10-12");
    const policies = readRepo("../data/policies.ts");
    assert.match(policies, /applyCancellationFoundingStatus/);
    assert.match(policies, /CANCELLATION_REFUND_EFFECTIVE_DATE/);
    assert.match(policies, /CANCELLATION_REFUND_UPDATED_AT/);
    assert.match(policies, /cancellation_refund/);
  });
});
