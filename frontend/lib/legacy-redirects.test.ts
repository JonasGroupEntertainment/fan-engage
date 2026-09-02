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
  it("sends the Vercel production alias and apex to https://www.fanengagepro.com via shared rules", () => {
    assert.match(nextConfig, /productionHostRedirectRules\(\)/);
    assert.doesNotMatch(nextConfig, /destination:\s*"https:\/\/fanengagepro\.com/);
  });
});

describe("pricing / plans aliases", () => {
  it("redirects /pricing and /plans to /premium", () => {
    assert.match(nextConfig, /source:\s*"\/pricing"/);
    assert.match(nextConfig, /source:\s*"\/plans"/);
    assert.match(nextConfig, /destination:\s*"\/premium"/);
  });
});

describe("settings alias", () => {
  it("redirects /settings to /me", () => {
    assert.match(nextConfig, /source:\s*"\/settings"/);
    assert.match(nextConfig, /destination:\s*"\/me"/);
  });
});
