import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRIAL_DAYS,
  invoiceGrantsCredit,
  isTrialConversion,
  isTrialEligible,
  isTrialing,
  shouldMoveOffFounderPrice,
} from "./premium-trial.ts";

describe("isTrialEligible", () => {
  it("is 7 days", () => {
    assert.equal(TRIAL_DAYS, 7);
  });

  it("allows a fan with no billing history", () => {
    assert.equal(isTrialEligible({ stripeSubscriptionCount: 0, pastPaidMemberships: 0 }), true);
  });

  it("blocks a fan who ever had a Stripe subscription, even a canceled trial", () => {
    assert.equal(isTrialEligible({ stripeSubscriptionCount: 1, pastPaidMemberships: 0 }), false);
  });

  it("blocks a fan who held a paid membership in any community", () => {
    assert.equal(isTrialEligible({ stripeSubscriptionCount: 0, pastPaidMemberships: 2 }), false);
  });
});

describe("isTrialing", () => {
  it("is true only for the trialing status", () => {
    assert.equal(isTrialing("trialing"), true);
    assert.equal(isTrialing("active"), false);
    assert.equal(isTrialing(null), false);
  });
});

describe("isTrialConversion", () => {
  it("fires when trialing becomes active", () => {
    assert.equal(isTrialConversion("active", "trialing"), true);
  });

  it("does not fire for other changes", () => {
    assert.equal(isTrialConversion("active", undefined), false);
    assert.equal(isTrialConversion("active", "past_due"), false);
    assert.equal(isTrialConversion("canceled", "trialing"), false);
    assert.equal(isTrialConversion("past_due", "trialing"), false);
  });
});

describe("invoiceGrantsCredit", () => {
  it("skips the $0 trial invoice", () => {
    assert.equal(invoiceGrantsCredit(0), false);
    assert.equal(invoiceGrantsCredit(null), false);
  });

  it("grants on a real payment", () => {
    assert.equal(invoiceGrantsCredit(499), true);
  });
});

describe("shouldMoveOffFounderPrice", () => {
  it("moves a founder-price fan who got no slot", () => {
    assert.equal(shouldMoveOffFounderPrice("founder", null), true);
    assert.equal(shouldMoveOffFounderPrice("founder", undefined), true);
    assert.equal(shouldMoveOffFounderPrice("founder", 0), true);
  });

  it("keeps a founder-price fan who got a slot", () => {
    assert.equal(shouldMoveOffFounderPrice("founder", 42), false);
  });

  it("never touches standard-price fans", () => {
    assert.equal(shouldMoveOffFounderPrice("standard", null), false);
    assert.equal(shouldMoveOffFounderPrice(null, null), false);
  });
});
