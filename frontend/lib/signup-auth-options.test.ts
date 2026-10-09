import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSignupAuthOptions } from "./signup-auth-options.ts";

describe("buildSignupAuthOptions", () => {
  it("binds a configured Turnstile token to the Supabase Auth request", () => {
    assert.deepEqual(
      buildSignupAuthOptions({
        emailRedirectTo:
          "https://www.fanengagepro.com/auth/callback?next=%2Fonboarding",
        turnstileConfigured: true,
        turnstileToken: "verified-token",
        consentVersion: "2026-08-01.v1",
        acceptedAt: "2026-09-05T00:00:00.000Z",
      }),
      {
        emailRedirectTo:
          "https://www.fanengagepro.com/auth/callback?next=%2Fonboarding",
        captchaToken: "verified-token",
        data: {
          consent_accepted_at: "2026-09-05T00:00:00.000Z",
          consent_version: "2026-08-01.v1",
        },
      },
    );
  });

  it("rejects configured signup without a token", () => {
    assert.throws(
      () =>
        buildSignupAuthOptions({
          emailRedirectTo: "https://www.fanengagepro.com/auth/callback",
          turnstileConfigured: true,
          turnstileToken: null,
        }),
      /Turnstile token is required/,
    );
  });

  it("stores an E.164 phone and SMS consent only when the box counts", () => {
    const withSms = buildSignupAuthOptions({
      emailRedirectTo: "https://www.fanengagepro.com/auth/callback",
      turnstileConfigured: false,
      turnstileToken: null,
      phone: "+16155550123",
      smsOptedIn: true,
    });
    assert.deepEqual(withSms.data, {
      phone: "+16155550123",
      sms_opted_in: "true",
    });

    const phoneOnly = buildSignupAuthOptions({
      emailRedirectTo: "https://www.fanengagepro.com/auth/callback",
      turnstileConfigured: false,
      turnstileToken: null,
      phone: "+16155550123",
      smsOptedIn: false,
    });
    assert.deepEqual(phoneOnly.data, { phone: "+16155550123" });
  });

  it("omits captcha and consent metadata when those features are absent", () => {
    assert.deepEqual(
      buildSignupAuthOptions({
        emailRedirectTo: "http://localhost:3000/auth/callback",
        turnstileConfigured: false,
        turnstileToken: null,
      }),
      { emailRedirectTo: "http://localhost:3000/auth/callback" },
    );
  });
});
