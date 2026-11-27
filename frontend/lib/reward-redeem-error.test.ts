import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALREADY_WAITING_MESSAGE,
  ONE_PENDING_INDEX,
  isAlreadyWaitingError,
  redeemErrorMessage,
} from "./reward-redeem-error.ts";

const DUPLICATE = {
  code: "23505",
  message: `duplicate key value violates unique constraint "${ONE_PENDING_INDEX}"`,
};

describe("a redemption the database refused as a duplicate", () => {
  it("is recognised by its code and index name", () => {
    assert.equal(isAlreadyWaitingError(DUPLICATE), true);
  });

  it("reads the same as the app's own check", () => {
    assert.equal(redeemErrorMessage(DUPLICATE), ALREADY_WAITING_MESSAGE);
  });

  it("is not confused with another duplicate or another error", () => {
    assert.equal(isAlreadyWaitingError({ code: "23505", message: 'unique constraint "other_index"' }), false);
    assert.equal(isAlreadyWaitingError({ code: "P0001", message: "Insufficient points" }), false);
    assert.equal(isAlreadyWaitingError(null), false);
  });
});

describe("any other redeem failure", () => {
  it("keeps the function's own message", () => {
    assert.equal(redeemErrorMessage({ code: "P0001", message: "Insufficient points" }), "Insufficient points");
  });

  it("has a plain line when there is no message", () => {
    assert.equal(redeemErrorMessage({ code: "XX000", message: "  " }), "We could not redeem that reward. Please try again.");
    assert.equal(redeemErrorMessage(undefined), "We could not redeem that reward. Please try again.");
  });
});
