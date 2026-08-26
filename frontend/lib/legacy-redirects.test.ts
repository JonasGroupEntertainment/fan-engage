import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const nextConfig = readFileSync(
  fileURLToPath(new URL("../next.config.ts", import.meta.url)),
  "utf8",
);

describe("legacy /shop alias", () => {
  it("redirects /shop and /shop/* to /marketplace", () => {
    assert.match(nextConfig, /source:\s*"\/shop"/);
    assert.match(nextConfig, /source:\s*"\/shop\/:path\*"/);
    assert.match(nextConfig, /destination:\s*"\/marketplace"/);
  });
});

describe("production host canonicalization", () => {
  it("sends the Vercel production alias and apex to https://www.fanengagepro.com", () => {
    assert.match(nextConfig, /value:\s*"fan-engage-pearl\.vercel\.app"/);
    assert.match(nextConfig, /value:\s*"fanengagepro\.com"/);
    assert.match(nextConfig, /destination:\s*"https:\/\/www\.fanengagepro\.com\/"/);
    assert.match(nextConfig, /destination:\s*"https:\/\/www\.fanengagepro\.com\/:path\*"/);
  });
});
