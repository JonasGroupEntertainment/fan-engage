import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMagicLinkAuthOptions } from "./magic-link-auth-options.ts";

describe("buildMagicLinkAuthOptions", () => {
  it("binds the unconsumed Turnstile token to the Supabase OTP request", () => {
    assert.deepEqual(
      buildMagicLinkAuthOptions({
        emailRedirectTo: "https://www.fanengagepro.com/auth/callback",
        turnstileConfigured: true,
        turnstileToken: " otp-token ",
      }),
      {
        emailRedirectTo: "https://www.fanengagepro.com/auth/callback",
        captchaToken: "otp-token",
      },
    );
  });

  it("rejects configured OTP requests without a Turnstile token", () => {
    assert.throws(
      () =>
        buildMagicLinkAuthOptions({
          emailRedirectTo: "https://www.fanengagepro.com/auth/callback",
          turnstileConfigured: true,
          turnstileToken: null,
        }),
      /Turnstile token is required/,
    );
  });

  it("omits CAPTCHA when Turnstile is not configured", () => {
    assert.deepEqual(
      buildMagicLinkAuthOptions({
        emailRedirectTo: "http://localhost:3000/auth/callback",
        turnstileConfigured: false,
        turnstileToken: null,
      }),
      { emailRedirectTo: "http://localhost:3000/auth/callback" },
    );
  });
});
