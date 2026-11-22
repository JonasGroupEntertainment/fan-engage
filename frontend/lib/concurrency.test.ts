import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapWithConcurrency } from "./concurrency.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

describe("mapWithConcurrency", () => {
  it("keeps results in input order", async () => {
    const out = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      for (let i = 0; i < n; i++) await tick();
      return n * 10;
    });
    assert.deepEqual(out, [30, 10, 20]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 5, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    });
    assert.equal(peak, 5);
  });

  it("handles an empty list and a limit below one", async () => {
    assert.deepEqual(await mapWithConcurrency([], 5, async (n: number) => n), []);
    assert.deepEqual(await mapWithConcurrency([1, 2], 0, async (n) => n), [1, 2]);
  });
});
