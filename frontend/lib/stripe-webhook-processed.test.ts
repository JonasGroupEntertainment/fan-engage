import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isStripeEventReplay,
  monthlyCreditGrantRow,
  stripeEventCompletionPatch,
  stripeEventInsertOutcome,
  throwIfDbError,
} from "./stripe-webhook-processed.ts";

describe("isStripeEventReplay", () => {
  it("replays only when processed_at is set", () => {
    assert.equal(isStripeEventReplay("2026-08-13T00:00:00.000Z"), true);
    assert.equal(isStripeEventReplay(null), false);
    assert.equal(isStripeEventReplay(undefined), false);
    assert.equal(isStripeEventReplay(""), false);
  });
});

describe("stripeEventCompletionPatch", () => {
  it("does not mark processed on handler error so Stripe can retry", () => {
    assert.deepEqual(stripeEventCompletionPatch("membership update failed"), {
      processed_at: null,
      error: "membership update failed",
    });
  });

  it("marks processed and clears error on success", () => {
    const now = new Date("2026-08-13T12:00:00.000Z");
    assert.deepEqual(stripeEventCompletionPatch(null, now), {
      processed_at: "2026-08-13T12:00:00.000Z",
      error: null,
    });
  });
});

describe("stripeEventInsertOutcome", () => {
  it("treats a clean insert as recorded", () => {
    assert.equal(stripeEventInsertOutcome(null), "recorded");
  });

  it("treats a duplicate key as a concurrent delivery, not a failure", () => {
    assert.equal(stripeEventInsertOutcome({ code: "23505", message: "dup" }), "duplicate");
  });

  it("fails on any other insert error so Stripe retries instead of processing untracked", () => {
    assert.equal(stripeEventInsertOutcome({ code: "42501", message: "denied" }), "failed");
    assert.equal(stripeEventInsertOutcome({ message: "network" }), "failed");
  });
});

describe("throwIfDbError", () => {
  it("does nothing when there is no error", () => {
    assert.doesNotThrow(() => throwIfDbError({ error: null }, "membership update"));
  });

  it("throws with the label so the handler fails and the event stays unprocessed", () => {
    assert.throws(
      () => throwIfDbError({ error: { message: "timeout" } }, "membership update"),
      /membership update failed: timeout/,
    );
  });
});

describe("monthlyCreditGrantRow", () => {
  it("keys the ledger row on the Stripe event id, not the invoice id", () => {
    assert.deepEqual(
      monthlyCreditGrantRow({ fanId: "fan_1", communityId: "c_1", eventId: "evt_123" }),
      {
        fan_id: "fan_1",
        community_id: "c_1",
        amount_cents: 500,
        reason: "monthly_refresh",
        stripe_event_id: "evt_123",
      },
    );
  });
});

describe("stripe webhook route wiring", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../app/api/stripe/webhook/route.ts", import.meta.url)),
    "utf8",
  );

  it("returns 500 when the event log insert fails for a non-duplicate reason", () => {
    assert.match(src, /stripeEventInsertOutcome\(insertErr\)\s*===\s*"failed"/);
  });

  it("passes the event id into invoice.paid and never uses the invoice id for credit_grants", () => {
    assert.match(src, /handleInvoicePaid\(\s*event\.data\.object as Stripe\.Invoice,\s*event\.id,/);
    assert.doesNotMatch(src, /stripe_event_id:\s*invoice\.id/);
  });

  it("writes the credit ledger row after the membership update", () => {
    const handler = src.slice(src.indexOf("async function handleInvoicePaid"));
    const updateAt = handler.indexOf('"invoice.paid membership update"');
    const ledgerAt = handler.indexOf("monthlyCreditGrantRow(");
    assert.ok(updateAt > 0 && ledgerAt > updateAt);
  });

  it("checks errors on every membership write", () => {
    for (const label of [
      "subscription.updated membership update",
      "subscription.deleted membership update",
      "invoice.paid membership update",
      "invoice.payment_failed membership update",
    ]) {
      assert.ok(src.includes(`"${label}"`), label);
    }
  });
});
