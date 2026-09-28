import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  invoiceSubscriptionId,
  subscriptionPeriodEndIso,
  subscriptionPeriodEndSeconds,
} from "./stripe-moved-fields.ts";

const END = 1790000000; // 2026-09-21T14:13:20.000Z
const END_ISO = new Date(END * 1000).toISOString();

describe("subscriptionPeriodEndSeconds", () => {
  it("reads items.data[].current_period_end (API 2025-03-31 and newer)", () => {
    const sub = { items: { data: [{ current_period_end: END }] } };
    assert.equal(subscriptionPeriodEndSeconds(sub), END);
    assert.equal(subscriptionPeriodEndIso(sub), END_ISO);
  });

  it("falls back to top-level current_period_end (older API versions)", () => {
    const sub = { current_period_end: END, items: { data: [{}] } };
    assert.equal(subscriptionPeriodEndSeconds(sub), END);
    assert.equal(subscriptionPeriodEndIso(sub), END_ISO);
  });

  it("prefers the item value when both shapes are present", () => {
    const sub = {
      current_period_end: END - 100,
      items: { data: [{ current_period_end: END }] },
    };
    assert.equal(subscriptionPeriodEndSeconds(sub), END);
  });

  it("uses the latest item end when items differ", () => {
    const sub = {
      items: {
        data: [
          { current_period_end: END - 500 },
          { current_period_end: END },
        ],
      },
    };
    assert.equal(subscriptionPeriodEndSeconds(sub), END);
  });

  it("returns null when no period end is present", () => {
    assert.equal(subscriptionPeriodEndSeconds({}), null);
    assert.equal(subscriptionPeriodEndSeconds({ items: { data: [] } }), null);
    assert.equal(subscriptionPeriodEndSeconds({ current_period_end: 0 }), null);
    assert.equal(subscriptionPeriodEndSeconds(null), null);
    assert.equal(subscriptionPeriodEndIso(undefined), null);
  });
});

describe("invoiceSubscriptionId", () => {
  it("reads parent.subscription_details.subscription (API 2025-03-31 and newer)", () => {
    const invoice = {
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_new" },
      },
    };
    assert.equal(invoiceSubscriptionId(invoice), "sub_new");
  });

  it("falls back to top-level subscription (older API versions)", () => {
    assert.equal(invoiceSubscriptionId({ subscription: "sub_old" }), "sub_old");
    assert.equal(
      invoiceSubscriptionId({ subscription: "sub_old", parent: null }),
      "sub_old",
    );
  });

  it("accepts an expanded Subscription object in either location", () => {
    assert.equal(
      invoiceSubscriptionId({
        parent: { subscription_details: { subscription: { id: "sub_x" } } },
      }),
      "sub_x",
    );
    assert.equal(invoiceSubscriptionId({ subscription: { id: "sub_y" } }), "sub_y");
  });

  it("returns null for one-off invoices", () => {
    assert.equal(
      invoiceSubscriptionId({
        parent: { type: "quote_details", subscription_details: null },
      }),
      null,
    );
    assert.equal(invoiceSubscriptionId({ subscription: null }), null);
    assert.equal(invoiceSubscriptionId({ subscription: "" }), null);
    assert.equal(invoiceSubscriptionId({}), null);
    assert.equal(invoiceSubscriptionId(null), null);
  });
});
