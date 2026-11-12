import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IN_CHUNK, PAGE_SIZE, chunk, pageAll, pageAllIn, type PageQuery } from "./page-all.ts";

/** A fake PostgREST table: `.range()` slices like the real one (inclusive). */
function table<Row>(rows: Row[], log: Array<[number, number]> = []): () => PageQuery<Row> {
  return () => ({
    range(from, to) {
      log.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  });
}

describe("pageAll", () => {
  it("reads past the 1,000-row cap and stops on the first short page", async () => {
    const rows = Array.from({ length: 2_345 }, (_, i) => ({ i }));
    const log: Array<[number, number]> = [];
    const res = await pageAll(table(rows, log));
    assert.equal(res.error, null);
    assert.equal(res.data?.length, 2_345);
    assert.deepEqual(res.data?.at(-1), { i: 2_344 });
    assert.deepEqual(log, [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    assert.equal(PAGE_SIZE, 1000);
  });

  it("makes exactly one extra call when the count is a multiple of the page size", async () => {
    const log: Array<[number, number]> = [];
    const res = await pageAll(table(Array.from({ length: 20 }, (_, i) => i), log), 10);
    assert.equal(res.data?.length, 20);
    assert.deepEqual(log, [
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it("returns an empty list for an empty table and null data as empty", async () => {
    assert.deepEqual(await pageAll(table([])), { data: [], error: null });
    const nullish = await pageAll<number>(() => ({
      range: () => Promise.resolve({ data: null, error: null }),
    }));
    assert.deepEqual(nullish, { data: [], error: null });
  });

  it("surfaces the first page error and stops", async () => {
    let calls = 0;
    const res = await pageAll<number>(() => ({
      range: () => {
        calls += 1;
        return Promise.resolve({ data: null, error: { message: "boom" } });
      },
    }));
    assert.deepEqual(res, { data: null, error: { message: "boom" } });
    assert.equal(calls, 1);
  });
});

describe("chunk / pageAllIn", () => {
  it("splits ids into .in() batches of at most IN_CHUNK", () => {
    assert.equal(IN_CHUNK, 200);
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunk([], 2), []);
    const parts = chunk(Array.from({ length: 1_551 }, (_, i) => i), IN_CHUNK);
    assert.equal(parts.length, 8);
    assert.equal(parts[7].length, 151);
  });

  it("pages every chunk and concatenates in order", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const seen: string[][] = [];
    const res = await pageAllIn(ids, (part) => {
      seen.push(part);
      return table(part.map((id) => ({ fan_id: id })))();
    });
    assert.equal(res.error, null);
    assert.equal(res.data?.length, 450);
    assert.deepEqual(res.data?.[449], { fan_id: "id-449" });
    assert.deepEqual(seen.map((s) => s.length), [200, 200, 50]);
  });
});
