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
