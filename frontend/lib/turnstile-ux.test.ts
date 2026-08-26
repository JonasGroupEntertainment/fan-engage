import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TURNSTILE_LOAD_TIMEOUT_MS,
  TURNSTILE_SCRIPT_RETRY_DELAYS_MS,
  TURNSTILE_SLOW_LOAD_HINT_MS,
  TURNSTILE_WIDGET_ERROR_COPY,
  emailReadyForMagicLink,
  magicLinkButtonLabel,
  magicLinkClickAction,
  magicLinkGateMessage,
  magicLinkPersistentHelper,
  nextMagicLinkGate,
  nextSignupTurnstileGate,
  shouldShowParentChallengeError,
  signupAllowsSubmit,
  signupTurnstileButtonLabel,
  turnstileSlowLoadHint,
} from "./turnstile-ux.ts";

describe("nextMagicLinkGate", () => {
  it("sends immediately when Turnstile is not configured", () => {
    assert.equal(
      nextMagicLinkGate({
        configured: false,
        revealed: false,
        token: null,
        loadState: "loading",
      }),
      "send",
    );
  });

  it("reveals the check on first magic-link tap", () => {
    assert.equal(
      nextMagicLinkGate({
        configured: true,
        revealed: false,
        token: null,
        loadState: "loading",
      }),
      "reveal",
    );
  });

  it("waits while the widget is loading after reveal", () => {
    assert.equal(
      nextMagicLinkGate({
        configured: true,
        revealed: true,
        token: null,
        loadState: "loading",
      }),
      "wait-load",
    );
  });

  it("asks the user to complete a visible check", () => {
    assert.equal(
      nextMagicLinkGate({
        configured: true,
        revealed: true,
        token: null,
        loadState: "ready",
      }),
      "complete-check",
    );
  });

  it("points at Retry when the widget failed to load", () => {
    assert.equal(
      nextMagicLinkGate({
        configured: true,
        revealed: true,
        token: null,
        loadState: "error",
      }),
      "retry",
    );
  });

  it("sends once a token exists", () => {
    assert.equal(
      nextMagicLinkGate({
        configured: true,
        revealed: true,
        token: "tok",
        loadState: "ready",
      }),
      "send",
    );
  });
});

describe("empty email before expand (Hana NIT)", () => {
  it("treats blank and whitespace as not ready", () => {
    assert.equal(emailReadyForMagicLink(""), false);
    assert.equal(emailReadyForMagicLink("   "), false);
    assert.equal(emailReadyForMagicLink("fan@example.com"), true);
  });

  it("does not reveal Turnstile when email is empty", () => {
    assert.equal(
      magicLinkClickAction({
        email: "",
        configured: true,
        revealed: false,
        token: null,
        loadState: "loading",
      }),
      "need-email",
    );
    assert.equal(
      magicLinkClickAction({
        email: "  ",
        configured: true,
        revealed: false,
        token: null,
        loadState: "loading",
      }),
      "need-email",
    );
  });

  it("reveals only after an email is present", () => {
    assert.equal(
      magicLinkClickAction({
        email: "fan@example.com",
        configured: true,
        revealed: false,
        token: null,
        loadState: "loading",
      }),
      "reveal",
    );
  });
});

describe("fail / loading copy (one message at a time)", () => {
  it("hides the green helper while failed or loading", () => {
    assert.equal(
      magicLinkPersistentHelper({
        gate: "complete-check",
        loadState: "error",
        challengeFailed: false,
      }),
      null,
    );
    assert.equal(
      magicLinkPersistentHelper({
        gate: "wait-load",
        loadState: "loading",
        challengeFailed: false,
      }),
      null,
    );
    assert.equal(
      magicLinkPersistentHelper({
        gate: "complete-check",
        loadState: "ready",
        challengeFailed: true,
      }),
      null,
    );
  });

  it("shows the complete-check helper only when the widget is ready", () => {
    assert.equal(
      magicLinkPersistentHelper({
        gate: "complete-check",
        loadState: "ready",
        challengeFailed: false,
      }),
      "Complete the security check, then send a magic link.",
    );
  });

  it("does not flash a parent error under the retry skeleton", () => {
    assert.equal(
      shouldShowParentChallengeError({
        loadState: "loading",
        challengeFailed: true,
      }),
      false,
    );
    assert.equal(
      shouldShowParentChallengeError({
        loadState: "error",
        challengeFailed: true,
      }),
      false,
    );
  });

  it("keeps widget fail copy as a single coherent line", () => {
    assert.match(TURNSTILE_WIDGET_ERROR_COPY, /couldn't load/i);
    assert.doesNotMatch(TURNSTILE_WIDGET_ERROR_COPY, /Security check failed/i);
  });
});

describe("magic-link copy", () => {
  it("keeps the first CTA as a choice, not a disabled trap", () => {
    assert.equal(
      magicLinkButtonLabel({
        cooldown: 0,
        status: "idle",
        gate: "reveal",
      }),
      "Email me a magic link instead",
    );
    assert.equal(magicLinkGateMessage("reveal"), null);
  });

  it("explains loading, retry, and complete-check states", () => {
    assert.equal(
      magicLinkButtonLabel({ cooldown: 0, status: "idle", gate: "wait-load" }),
      "Security check loading…",
    );
    assert.match(
      magicLinkButtonLabel({ cooldown: 0, status: "idle", gate: "retry" }),
      /retry above or use password/i,
    );
    assert.match(
      magicLinkButtonLabel({ cooldown: 0, status: "idle", gate: "complete-check" }),
      /Complete security check above/,
    );
  });
});

describe("signup Turnstile gate", () => {
  it("does not block when Turnstile is not configured", () => {
    const gate = nextSignupTurnstileGate({
      configured: false,
      token: null,
      loadState: "loading",
    });
    assert.equal(gate, "not-configured");
    assert.equal(signupAllowsSubmit(gate), true);
  });

  it("disables Create account while the widget is loading", () => {
    const gate = nextSignupTurnstileGate({
      configured: true,
      token: null,
      loadState: "loading",
    });
    assert.equal(gate, "wait-load");
    assert.equal(signupAllowsSubmit(gate), false);
    assert.equal(
      signupTurnstileButtonLabel({ status: "idle", gate }),
      "Create account",
    );
  });

  it("disables Create account until a visible check is completed", () => {
    const gate = nextSignupTurnstileGate({
      configured: true,
      token: null,
      loadState: "ready",
    });
    assert.equal(gate, "complete-check");
    assert.equal(signupAllowsSubmit(gate), false);
    assert.equal(
      signupTurnstileButtonLabel({ status: "idle", gate }),
      "Create account",
    );
  });

  it("fail-opens Create account when the widget never loads", () => {
    const gate = nextSignupTurnstileGate({
      configured: true,
      token: null,
      loadState: "error",
    });
    assert.equal(gate, "fail-open");
    assert.equal(signupAllowsSubmit(gate), true);
    assert.equal(
      signupTurnstileButtonLabel({ status: "idle", gate }),
      "Create account",
    );
  });

  it("never puts security-check loading copy on Create account", () => {
    for (const gate of ["wait-load", "complete-check", "fail-open", "ready", "not-configured"] as const) {
      assert.equal(
        signupTurnstileButtonLabel({ status: "idle", gate }),
        "Create account",
      );
    }
  });

  it("allows submit once a token exists", () => {
    const gate = nextSignupTurnstileGate({
      configured: true,
      token: "tok",
      loadState: "ready",
    });
    assert.equal(gate, "ready");
    assert.equal(signupAllowsSubmit(gate), true);
  });

  it("never uses confirmation-email resend as the signup CTA", () => {
    const label = signupTurnstileButtonLabel({
      status: "need-signin",
      gate: "wait-load",
    });
    assert.equal(label, "Sign in with the password you just created");
    assert.doesNotMatch(label, /confirmation email/i);
    assert.doesNotMatch(
      signupTurnstileButtonLabel({ status: "idle", gate: "ready" }),
      /confirmation email/i,
    );
    assert.doesNotMatch(
      signupTurnstileButtonLabel({ status: "loading", gate: "ready" }),
      /confirmation email/i,
    );
  });
});

describe("timeout alignment", () => {
  it("keeps a 12s hang timeout and a 6s still-loading hint", () => {
    assert.equal(TURNSTILE_LOAD_TIMEOUT_MS, 12_000);
    assert.equal(TURNSTILE_SLOW_LOAD_HINT_MS, 6_000);
    assert.ok(TURNSTILE_SLOW_LOAD_HINT_MS < TURNSTILE_LOAD_TIMEOUT_MS);
  });

  it("does not give up on script retries at ~6s", () => {
    const sum = TURNSTILE_SCRIPT_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
    assert.ok(
      sum >= 8_000,
      `script retry backoff should span most of the 12s window, got ${sum}ms`,
    );
    assert.ok(sum <= TURNSTILE_LOAD_TIMEOUT_MS);
  });

  it("updates skeleton copy after the slow-load hint", () => {
    assert.equal(turnstileSlowLoadHint(false), "Security check loading…");
    assert.match(turnstileSlowLoadHint(true), /12 seconds/);
  });
});
