import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkSharedRateLimit, hashRateLimitIdentifier } from "./shared-rate-limit.ts";

describe("shared authentication rate limiting", () => {
  it("hashes identifiers deterministically without retaining the raw value", () => {
    const first = hashRateLimitIdentifier("203.0.113.7", "test-salt");
    const second = hashRateLimitIdentifier("203.0.113.7", "test-salt");
    assert.equal(first, second);
    assert.equal(first.length, 64);
    assert.doesNotMatch(first, /203\.0\.113\.7/);
    assert.notEqual(first, hashRateLimitIdentifier("203.0.113.7", "other-salt"));
  });

  it("passes an isolated scope and hashed identifier to the atomic consumer", async () => {
    const decision = await checkSharedRateLimit(
      {
        scope: "turnstile-verify",
        identifier: "203.0.113.7",
        limit: 10,
        windowSeconds: 900,
        salt: "test-salt",
      },
      async (args) => {
        assert.equal(args.p_scope, "turnstile-verify");
        assert.notEqual(args.p_identifier_hash, "203.0.113.7");
        assert.equal(args.p_limit, 10);
        assert.equal(args.p_window_seconds, 900);
        return {
          allowed: true,
          remaining: 9,
          reset_at: "2026-09-05T00:15:00.000Z",
        };
      },
    );

    assert.deepEqual(decision, {
      allowed: true,
      remaining: 9,
      resetAt: "2026-09-05T00:15:00.000Z",
    });
  });

  it("maps exhausted limits without changing their reset time", async () => {
    const decision = await checkSharedRateLimit(
      {
        scope: "signup-error",
        identifier: "203.0.113.7",
        limit: 10,
        windowSeconds: 900,
        salt: "test-salt",
      },
      async () => ({
        allowed: false,
        remaining: 0,
        reset_at: "2026-09-05T00:15:00.000Z",
      }),
    );

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "exhausted");
  });

  it("fails closed when the shared backend throws or returns malformed data", async () => {
    const input = {
      scope: "turnstile-verify",
      identifier: "203.0.113.7",
      limit: 10,
      windowSeconds: 900,
      salt: "test-salt",
    };
    assert.deepEqual(
      await checkSharedRateLimit(input, async () => {
        throw new Error("database unavailable");
      }),
      { allowed: false, reason: "backend_unavailable" },
    );
    assert.deepEqual(
      await checkSharedRateLimit(input, async () => ({ allowed: "yes" } as never)),
      { allowed: false, reason: "backend_unavailable" },
    );
  });

  it("rejects unsafe limits before reaching the backend", async () => {
    await assert.rejects(
      checkSharedRateLimit({
        scope: "turnstile-verify",
        identifier: "203.0.113.7",
        limit: 0,
        windowSeconds: 900,
        salt: "test-salt",
      }),
      /limit must be a positive integer/,
    );
  });
});
