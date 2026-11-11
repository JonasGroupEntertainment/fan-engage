import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PASSWORD_RESET_LIMIT,
  PASSWORD_RESET_WINDOW_SECONDS,
  isUnderPasswordResetLimit,
  passwordResetBudgets,
  type PasswordResetBudget,
} from "./password-reset-rate-limit.ts";

type Decision = { allowed: boolean; reason?: string };

/** A fake limiter that counts per (scope, identifier), like the real one. */
function fakeLimiter() {
  const used = new Map<string, number>();
  const calls: PasswordResetBudget[] = [];
  const check = async (budget: PasswordResetBudget): Promise<Decision> => {
    calls.push(budget);
    const key = `${budget.scope}|${budget.identifier}`;
    const next = (used.get(key) ?? 0) + 1;
    used.set(key, next);
    return next > budget.limit ? { allowed: false, reason: "exhausted" } : { allowed: true };
  };
  return { check, calls };
}

describe("passwordResetBudgets", () => {
  it("gives the IP and the email a budget each, never one shared key", () => {
    // Arrange / Act
    const budgets = passwordResetBudgets("203.0.113.9", "fan@example.com");

    // Assert
    assert.deepEqual(budgets, [
      {
        scope: "password-reset:ip",
        identifier: "203.0.113.9",
        limit: PASSWORD_RESET_LIMIT,
        windowSeconds: PASSWORD_RESET_WINDOW_SECONDS,
      },
      {
        scope: "password-reset:email",
        identifier: "fan@example.com",
        limit: PASSWORD_RESET_LIMIT,
        windowSeconds: PASSWORD_RESET_WINDOW_SECONDS,
      },
    ]);
    for (const b of budgets) assert.equal(b.identifier.includes(":"), false);
  });

  it("checks the IP first, so a blocked IP cannot use up an address's budget", () => {
    assert.deepEqual(
      passwordResetBudgets("203.0.113.9", "fan@example.com").map((b) => b.scope),
      ["password-reset:ip", "password-reset:email"],
    );
  });

  it("drops the IP budget when the IP is unknown, so strangers do not share one bucket", () => {
    for (const ip of ["unknown", "", "   "]) {
      assert.deepEqual(
        passwordResetBudgets(ip, "fan@example.com").map((b) => b.scope),
        ["password-reset:email"],
      );
    }
  });
});

describe("isUnderPasswordResetLimit", () => {
  it("stops one IP from requesting resets for many different addresses", async () => {
    // Arrange
    const { check } = fakeLimiter();
    const ip = "203.0.113.9";

    // Act: five different addresses pass, the sixth is blocked.
    const results: boolean[] = [];
    for (let i = 1; i <= PASSWORD_RESET_LIMIT + 1; i += 1) {
      results.push(await isUnderPasswordResetLimit(ip, `fan${i}@example.com`, check));
    }

    // Assert
    assert.deepEqual(results, [true, true, true, true, true, false]);
  });

  it("stops one address from being targeted from many different IPs", async () => {
    const { check } = fakeLimiter();
    const results: boolean[] = [];
    for (let i = 1; i <= PASSWORD_RESET_LIMIT + 1; i += 1) {
      results.push(await isUnderPasswordResetLimit(`203.0.113.${i}`, "victim@example.com", check));
    }
    assert.deepEqual(results, [true, true, true, true, true, false]);
  });

  it("does not spend the email budget once the IP is blocked", async () => {
    const { check, calls } = fakeLimiter();
    const ip = "203.0.113.9";
    for (let i = 1; i <= PASSWORD_RESET_LIMIT; i += 1) {
      await isUnderPasswordResetLimit(ip, `fan${i}@example.com`, check);
    }
    calls.length = 0;

    const allowed = await isUnderPasswordResetLimit(ip, "victim@example.com", check);

    assert.equal(allowed, false);
    assert.deepEqual(calls.map((c) => c.scope), ["password-reset:ip"]);
  });

  it("lets the request through when the limiter is down, as before", async () => {
    // Turnstile still gates the request; an outage must not lock fans out.
    const down = async (): Promise<Decision> => ({ allowed: false, reason: "backend_unavailable" });
    assert.equal(await isUnderPasswordResetLimit("203.0.113.9", "fan@example.com", down), true);

    const throws = async (): Promise<Decision> => {
      throw new Error("network");
    };
    assert.equal(await isUnderPasswordResetLimit("203.0.113.9", "fan@example.com", throws), true);
  });
});

describe("the forgot-password action uses the shared policy", () => {
  it("no longer builds one key from the IP and the email together", () => {
    const src = readFileSync(new URL("../app/forgot-password/actions.ts", import.meta.url), "utf8");
    assert.match(src, /isUnderPasswordResetLimit\(/);
    assert.doesNotMatch(src, /\$\{ip\}:\$\{email\}/);
  });
});
