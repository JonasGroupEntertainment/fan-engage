import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAcceptConsent, isScrollAtBottom } from "./consent-accept.ts";

describe("isScrollAtBottom", () => {
  it("is true when content does not overflow", () => {
    assert.equal(
      isScrollAtBottom({ scrollHeight: 200, scrollTop: 0, clientHeight: 200 }),
      true,
    );
  });

  it("is true when already within the end threshold", () => {
    assert.equal(
      isScrollAtBottom({ scrollHeight: 800, scrollTop: 580, clientHeight: 200 }),
      true,
    );
  });

  it("is false when the fan is still mid-document", () => {
    assert.equal(
      isScrollAtBottom({ scrollHeight: 800, scrollTop: 0, clientHeight: 200 }),
      false,
    );
  });
});

describe("canAcceptConsent", () => {
  it("unlocks when every doc has been scrolled to the end", () => {
    assert.equal(
      canAcceptConsent({
        docCount: 2,
        scrolledEnd: { 0: true, 1: true },
        acknowledged: false,
      }),
      true,
    );
  });

  it("stays locked if any doc is unread and the checkbox is off", () => {
    assert.equal(
      canAcceptConsent({
        docCount: 2,
        scrolledEnd: { 0: true },
        acknowledged: false,
      }),
      false,
    );
  });

  it("unlocks via the checkbox even when no doc has been scrolled", () => {
    assert.equal(
      canAcceptConsent({
        docCount: 2,
        scrolledEnd: {},
        acknowledged: true,
      }),
      true,
    );
  });

  it("unlocks when there are no docs to review", () => {
    assert.equal(
      canAcceptConsent({
        docCount: 0,
        scrolledEnd: {},
        acknowledged: false,
      }),
      true,
    );
  });
});
