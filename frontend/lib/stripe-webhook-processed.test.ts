import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStripeEventReplay,
  stripeEventCompletionPatch,
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
