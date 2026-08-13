import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  magicLinkButtonLabel,
  magicLinkGateMessage,
  nextMagicLinkGate,
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
    assert.equal(magicLinkGateMessage("reveal"), "Complete the security check, then send a magic link.");
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
