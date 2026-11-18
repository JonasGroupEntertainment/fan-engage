import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isBreachedPassword, sha1Hex, suffixInRange } from "./password-breach-check.ts";

describe("password breach check", () => {
  it("hashes with SHA-1 in upper-case hex", async () => {
    assert.equal(await sha1Hex("password"), "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
  });

  it("finds an ending with a real count and ignores padding", () => {
    const body = "AAA:3\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nBBB:0";
    assert.equal(suffixInRange(body, "1e4c9b93f3f0682250b6cf8331b7ee68fd8"), true);
    assert.equal(suffixInRange(body, "BBB"), false);
    assert.equal(suffixInRange(body, "CCC"), false);
  });

  it("sends only the first five characters of the hash", async () => {
    let url = "";
    const fake = (async (input: RequestInfo | URL) => {
      url = String(input);
      return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:5");
    }) as typeof fetch;
    assert.equal(await isBreachedPassword("password", fake), true);
    assert.equal(url, "https://api.pwnedpasswords.com/range/5BAA6");
  });

  it("says 'could not check' when the list is unreachable", async () => {
    const down = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    assert.equal(await isBreachedPassword("whatever-long-password", down), null);
    const error = (async () => new Response("", { status: 503 })) as typeof fetch;
    assert.equal(await isBreachedPassword("whatever-long-password", error), null);
  });
});
