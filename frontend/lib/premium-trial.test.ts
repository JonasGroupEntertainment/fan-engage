import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CREDIT_REFRESH_DAYS,
  TRIAL_DAYS,
  cronShouldRefreshCredit,
  invoiceGrantsCredit,
  invoiceShouldRefreshCredit,
  isTrialConversion,
  isTrialEligible,
  isTrialing,
  shouldGrantConversionPerks,
  shouldMoveOffFounderPrice,
} from "./premium-trial.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const NOW = Date.parse("2026-10-18T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

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

describe("shouldGrantConversionPerks", () => {
  it("does not grant when a trial starts or its $0 invoice is paid", () => {
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.created",
        status: "trialing",
      }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "invoice.paid",
        amountPaidCents: 0,
      }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.created",
        status: "incomplete",
      }),
      false,
    );
  });

  it("grants for a checkout that is already active", () => {
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.created",
        status: "active",
      }),
      true,
    );
  });

  it("grants on a clean trial conversion and on that first paid invoice", () => {
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "active",
        previousStatus: "trialing",
      }),
      true,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "invoice.paid",
        amountPaidCents: 1000,
      }),
      true,
    );
  });

  it("grants when a declined first charge later succeeds", () => {
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "past_due",
        previousStatus: "trialing",
      }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({ event: "invoice.payment_failed" }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "active",
        previousStatus: "past_due",
      }),
      true,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "active",
        previousStatus: "unpaid",
      }),
      true,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "active",
        previousStatus: "incomplete",
      }),
      true,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "invoice.paid",
        amountPaidCents: 1000,
        alreadyPaid: false,
      }),
      true,
    );
  });

  it("does not grant again once the first payment is recorded", () => {
    assert.equal(
      shouldGrantConversionPerks({
        event: "invoice.paid",
        amountPaidCents: 1000,
        alreadyPaid: true,
      }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "active",
        previousStatus: "past_due",
        alreadyPaid: true,
      }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "active",
        previousStatus: "active",
      }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "active",
      }),
      false,
    );
  });

  it("does not grant when the subscription ends without a payment", () => {
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "canceled",
        previousStatus: "trialing",
      }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "customer.subscription.updated",
        status: "canceled",
        previousStatus: "past_due",
      }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({ event: "customer.subscription.deleted" }),
      false,
    );
    assert.equal(
      shouldGrantConversionPerks({
        event: "invoice.paid",
        amountPaidCents: 0,
        alreadyPaid: false,
      }),
      false,
    );
  });
});

describe("monthly credit timing", () => {
  it("refreshes on a real payment when the credit is stale, not on the $0 trial invoice", () => {
    assert.equal(CREDIT_REFRESH_DAYS, 25);
    assert.equal(invoiceShouldRefreshCredit(0, null, NOW), false);
    assert.equal(invoiceShouldRefreshCredit(null, null, NOW), false);
    assert.equal(invoiceShouldRefreshCredit(1000, null, NOW), true);
    assert.equal(
      invoiceShouldRefreshCredit(1000, new Date(NOW - 24 * DAY).toISOString(), NOW),
      false,
    );
    assert.equal(
      invoiceShouldRefreshCredit(1000, new Date(NOW - 25 * DAY).toISOString(), NOW),
      true,
    );
  });

  it("the cron skips a trialing premium fan and a past_due fan who has not cleared", () => {
    assert.equal(
      cronShouldRefreshCredit({
        tier: "premium",
        firstPaidAt: null,
        refreshedAt: null,
        nowMs: NOW,
      }),
      false,
    );
    assert.equal(
      cronShouldRefreshCredit({
        tier: "past_due",
        firstPaidAt: null,
        refreshedAt: null,
        nowMs: NOW,
      }),
      false,
    );
  });

  it("the cron refreshes a paid premium fan and a comped fan", () => {
    assert.equal(
      cronShouldRefreshCredit({
        tier: "premium",
        firstPaidAt: new Date(NOW - 30 * DAY).toISOString(),
        refreshedAt: null,
        nowMs: NOW,
      }),
      true,
    );
    assert.equal(
      cronShouldRefreshCredit({
        tier: "premium",
        firstPaidAt: new Date(NOW - 30 * DAY).toISOString(),
        refreshedAt: new Date(NOW - 10 * DAY).toISOString(),
        nowMs: NOW,
      }),
      false,
    );
    assert.equal(
      cronShouldRefreshCredit({
        tier: "comped",
        firstPaidAt: null,
        refreshedAt: null,
        nowMs: NOW,
      }),
      true,
    );
  });
});

describe("paid perk wiring", () => {
  const webhook = readRepo("../app/api/stripe/webhook/route.ts");
  const cron = readRepo("../app/api/cron/refresh-monthly-credits/route.ts");

  it("grants from the payment events and not from failure or deletion", () => {
    assert.match(webhook, /shouldGrantConversionPerks/);
    assert.match(cron, /cronShouldRefreshCredit/);

    const failed = webhook.slice(webhook.indexOf("async function handleInvoicePaymentFailed"));
    const deleted = webhook.slice(
      webhook.indexOf("async function handleSubscriptionDeleted"),
      webhook.indexOf("async function handleInvoicePaid"),
    );
    assert.doesNotMatch(failed, /grantConversionPerks/);
    assert.doesNotMatch(deleted, /grantConversionPerks/);
    assert.match(webhook, /first_paid_at/);
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
