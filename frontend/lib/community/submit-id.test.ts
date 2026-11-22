import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSubmitKey } from "./save-once.ts";
import { newSubmitId, type CryptoLike } from "./submit-id.ts";

// Plainly made-up id, never a random-looking one.
const MADE_UP_ID = "11111111-2222-4333-8444-555555555555";
const V4_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALL_BITS_SET = 0xff;

/** Fills the array with one fixed byte, so the output is the same every run. */
function fillWith(byte: number): CryptoLike["getRandomValues"] {
  return (array) => {
    array.fill(byte);
    return array;
  };
}

const throwing = (): never => {
  throw new Error("not allowed here");
};

describe("newSubmitId", () => {
  it("uses randomUUID when the browser has it", () => {
    const id = newSubmitId({ randomUUID: () => MADE_UP_ID, getRandomValues: throwing });
    assert.equal(id, MADE_UP_ID);
  });

  it("calls randomUUID as a method of the crypto object", () => {
    const source = {
      value: MADE_UP_ID,
      randomUUID(this: { value: string }) {
        return this.value;
      },
    };
    assert.equal(newSubmitId(source), MADE_UP_ID);
  });

  it("builds a v4 id from getRandomValues when randomUUID is missing", () => {
    for (const byte of [0, 1, 0x5a, ALL_BITS_SET]) {
      const id = newSubmitId({ getRandomValues: fillWith(byte) });
      assert.match(id, V4_SHAPE, `byte ${byte}`);
      assert.equal(parseSubmitKey(id), id, "the server accepts it");
    }
    assert.equal(newSubmitId({ getRandomValues: fillWith(0) }), "00000000-0000-4000-8000-000000000000");
  });

  it("falls back to getRandomValues when randomUUID throws or returns something odd", () => {
    for (const randomUUID of [throwing, () => "", () => "nope"]) {
      const id = newSubmitId({ randomUUID, getRandomValues: fillWith(ALL_BITS_SET) });
      assert.equal(id, "ffffffff-ffff-4fff-bfff-ffffffffffff");
    }
  });

  it("returns an empty string, and never throws, when nothing can make an id", () => {
    const hostile = new Proxy({}, { get: throwing }) as CryptoLike;
    // null stands for a browser with no crypto object at all.
    for (const source of [null, {}, { randomUUID: throwing }, { getRandomValues: throwing }, hostile]) {
      assert.equal(newSubmitId(source), "");
    }
  });

  it("an empty string is treated by the server as no id, so the post saves without the guard", () => {
    assert.equal(parseSubmitKey(""), null);
  });

  it("uses the real crypto by default and gives a fresh id each call", () => {
    const first = newSubmitId();
    const second = newSubmitId();
    assert.match(first, V4_SHAPE);
    assert.match(second, V4_SHAPE);
    assert.notEqual(first, second);
  });
});
