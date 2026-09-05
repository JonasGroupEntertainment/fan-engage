import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authRateLimitSalt } from "./auth-rate-limit-policy.ts";

describe("authRateLimitSalt", () => {
  it("uses a trimmed configured secret", () => {
    assert.equal(
      authRateLimitSalt({ RATE_LIMIT_HASH_SALT: "  deployment-secret  " }),
      "deployment-secret",
    );
  });

  it("rejects missing or blank production configuration", () => {
    assert.throws(
      () => authRateLimitSalt({ VERCEL_ENV: "production" }),
      /RATE_LIMIT_HASH_SALT is required in production/,
    );
    assert.throws(
      () =>
        authRateLimitSalt({
          NEXT_PUBLIC_VERCEL_ENV: "production",
          RATE_LIMIT_HASH_SALT: "   ",
        }),
      /RATE_LIMIT_HASH_SALT is required in production/,
    );
  });

  it("uses an explicit local-only fallback outside production", () => {
    assert.equal(
      authRateLimitSalt({ VERCEL_ENV: "preview" }),
      "fan-engage-local-rate-limit",
    );
    assert.equal(authRateLimitSalt({}), "fan-engage-local-rate-limit");
  });
});
