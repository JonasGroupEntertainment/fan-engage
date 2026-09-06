import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPasswordAuthCredentials } from "./password-auth-credentials.ts";

describe("buildPasswordAuthCredentials", () => {
  it("binds a configured Turnstile token to the Supabase password login request", () => {
    assert.deepEqual(
      buildPasswordAuthCredentials({
        email: "fan@example.com",
        password: "correct-horse-battery-staple",
        turnstileConfigured: true,
        turnstileToken: " verified-login-token ",
      }),
      {
        email: "fan@example.com",
        password: "correct-horse-battery-staple",
        options: { captchaToken: "verified-login-token" },
      },
    );
  });

  it("rejects configured password login without a Turnstile token", () => {
    assert.throws(
      () =>
        buildPasswordAuthCredentials({
          email: "fan@example.com",
          password: "correct-horse-battery-staple",
          turnstileConfigured: true,
          turnstileToken: null,
        }),
      /Turnstile token is required/,
    );
  });

  it("keeps local login available when Turnstile is not configured", () => {
    assert.deepEqual(
      buildPasswordAuthCredentials({
        email: "fan@example.com",
        password: "correct-horse-battery-staple",
        turnstileConfigured: false,
        turnstileToken: null,
      }),
      {
        email: "fan@example.com",
        password: "correct-horse-battery-staple",
      },
    );
  });
});
