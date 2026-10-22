import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { invoicePeriodEndIso } from "./stripe-moved-fields.ts";
import {
  checkoutFanCommunity,
  checkoutSubscriptionRef,
  membershipPeriodColumns,
  membershipPeriodPatch,
  periodEndMissing,
} from "./stripe-membership-period.ts";

const END = 1790000000;
const END_ISO = new Date(END * 1000).toISOString();

const itemSub = {
  id: "sub_123",
  status: "active",
  cancel_at_period_end: true,
  items: { data: [{ current_period_end: END }] },
};

describe("membershipPeriodPatch", () => {
  it("reads current_period_end from subscription items and saves status", () => {
    const patch = membershipPeriodPatch(itemSub, "customer.subscription.updated");
    assert.equal(patch.current_period_end, END_ISO);
    assert.equal(patch.subscription_tier, "premium");
    assert.equal(patch.cancel_at_period_end, true);
    assert.equal(patch.stripe_subscription_id, "sub_123");
    assert.equal(periodEndMissing(itemSub), false);
  });

  it("falls back to the top-level field on older API versions", () => {
    const patch = membershipPeriodPatch(
      {
        id: "sub_old",
        status: "trialing",
        cancel_at_period_end: false,
        current_period_end: END,
        items: { data: [{}] },
      },
      "checkout.session.completed",
    );
    assert.equal(patch.current_period_end, END_ISO);
    assert.equal(patch.subscription_tier, "premium");
  });

  it("on delete, keeps the item period end and clears the subscription id", () => {
    const columns = membershipPeriodColumns(
      membershipPeriodPatch(
        { id: "sub_123", status: "canceled", items: { data: [{ current_period_end: END }] } },
        "customer.subscription.deleted",
      ),
    );
    assert.equal(columns.subscription_tier, "free");
    assert.equal(columns.current_period_end, END_ISO);
    assert.equal(columns.cancel_at_period_end, false);
    assert.equal(columns.stripe_subscription_id, null);
  });

  it("does not write a null period end over a stored value", () => {
    const columns = membershipPeriodColumns(
      membershipPeriodPatch({ id: "sub_123", status: "active" }, "invoice.paid"),
    );
    assert.equal(columns.subscription_tier, "premium");
    assert.equal("current_period_end" in columns, false);
    assert.equal(periodEndMissing({ id: "sub_123" }), true);
  });

  it("invoice.paid uses the expanded subscription item period", () => {
    assert.equal(
      invoicePeriodEndIso({
        parent: { subscription_details: { subscription: itemSub } },
        period_end: END - 100,
      }),
      END_ISO,
    );
    assert.equal(
      invoicePeriodEndIso({
        lines: { data: [{ period: { end: END } }] },
      }),
      END_ISO,
    );
  });
});

describe("checkout session identity", () => {
  it("reads fan and community from metadata or client_reference_id", () => {
    assert.deepEqual(
      checkoutFanCommunity({
        metadata: { fan_id: "fan_1", community_id: "raelynn", billing_period: "annual" },
      }),
      { fanId: "fan_1", communityId: "raelynn", billingPeriod: "annual" },
    );
    assert.deepEqual(
      checkoutFanCommunity({
        metadata: {},
        client_reference_id: "fan_2:danger-twins",
      }),
      { fanId: "fan_2", communityId: "danger-twins", billingPeriod: null },
    );
  });

  it("accepts a subscription id or an expanded subscription", () => {
    assert.deepEqual(checkoutSubscriptionRef({ subscription: "sub_123" }), {
      id: "sub_123",
      expanded: null,
    });
    const expanded = { id: "sub_123", items: { data: [{ current_period_end: END }] } };
    assert.deepEqual(checkoutSubscriptionRef({ subscription: expanded }), {
      id: "sub_123",
      expanded,
    });
  });
});

describe("webhook route saves the period on the events that matter", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../app/api/stripe/webhook/route.ts", import.meta.url)),
    "utf8",
  );

  it("handles checkout, subscription, and invoice.paid", () => {
    for (const event of [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
    ]) {
      assert.match(route, new RegExp(event.replace(".", "\\.")));
    }
    assert.match(route, /membershipPeriodPatch/);
    assert.match(route, /subscriptions\.retrieve/);
    assert.match(route, /current_period_end missing on subscription and on subscription items/);
  });
});
