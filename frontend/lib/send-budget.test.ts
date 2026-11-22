import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADMIN_SEND_MAX_DURATION_SECONDS, SEND_TIME_BUDGET_MS, outOfTime, sendDeadline } from "./send-budget.ts";

describe("send time budget", () => {
  it("leaves room under the platform limit to record and show the result", () => {
    assert.equal(ADMIN_SEND_MAX_DURATION_SECONDS, 300);
    assert.ok(SEND_TIME_BUDGET_MS <= (ADMIN_SEND_MAX_DURATION_SECONDS - 60) * 1000);
  });

  it("sets the deadline from when the send started", () => {
    assert.equal(sendDeadline(1_000), 1_000 + SEND_TIME_BUDGET_MS);
  });

  it("is out of time at or after the deadline, never without one", () => {
    assert.equal(outOfTime(100, 99), false);
    assert.equal(outOfTime(100, 100), true);
    assert.equal(outOfTime(null, 1e15), false);
    assert.equal(outOfTime(undefined, 1e15), false);
  });
});
