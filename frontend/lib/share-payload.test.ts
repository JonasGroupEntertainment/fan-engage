import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { sharePayload } from "./share-payload.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("share payload", () => {
  it("puts the link in the message text on its own line", () => {
    assert.deepEqual(sharePayload({ title: "T", text: "Join me.", url: "https://x.test/invite/abc" }), {
      title: "T",
      text: "Join me.\nhttps://x.test/invite/abc",
    });
  });

  it("sends just the link when there is no text", () => {
    assert.equal(sharePayload({ title: "T", text: " ", url: "https://x.test/a" }).text, "https://x.test/a");
  });

  it("does not repeat a link the text already carries", () => {
    assert.equal(
      sharePayload({ title: "T", text: "Join me https://x.test/a", url: "https://x.test/a" }).text,
      "Join me https://x.test/a",
    );
  });

  it("both share buttons use it", () => {
    assert.match(read("../app/referrals/native-share-button.tsx"), /nav\.share\(sharePayload\(/);
    assert.match(read("../components/share-button.tsx"), /navigator\.share\(sharePayload\(/);
    assert.match(read("../components/weekly-recap-tile.tsx"), /nav\.share\(\s*sharePayload\(/);
  });
});
