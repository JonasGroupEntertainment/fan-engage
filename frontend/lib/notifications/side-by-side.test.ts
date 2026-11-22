import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSideBySide } from "./side-by-side.ts";

function gate(): { wait: Promise<void>; open: () => void } {
  let open = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

describe("runSideBySide", () => {
  it("starts every job before any of them finishes", async () => {
    const inbox = gate();
    const started: string[] = [];
    const run = runSideBySide<string>([
      async () => {
        started.push("inbox");
        await inbox.wait;
        return ["inbox row"];
      },
      async () => {
        started.push("push");
        return ["push row"];
      },
    ]);
    await Promise.resolve();
    assert.deepEqual(started, ["inbox", "push"]);
    inbox.open();
    assert.deepEqual(await run, { rows: ["inbox row", "push row"], errors: [] });
  });

  it("keeps the other job's rows when one job rejects", async () => {
    const failure = new Error("inbox write failed");
    const result = await runSideBySide<string>([
      async () => {
        throw failure;
      },
      async () => ["push row", "sms row"],
    ]);
    assert.deepEqual(result, { rows: ["push row", "sms row"], errors: [failure] });
  });

  it("still starts later jobs when an earlier one throws straight away", async () => {
    const failure = new Error("threw before any await");
    const result = await runSideBySide<string>([
      () => {
        throw failure;
      },
      async () => ["push row"],
    ]);
    assert.deepEqual(result, { rows: ["push row"], errors: [failure] });
  });

  it("returns nothing for no jobs", async () => {
    assert.deepEqual(await runSideBySide<string>([]), { rows: [], errors: [] });
  });
});
