import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAGIC_LINK_SENT_MESSAGE,
  buildMagicLinkAuthOptions,
  isNoAccountMagicLinkError,
} from "./magic-link-auth-options.ts";

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
        shouldCreateUser: false,
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
      { emailRedirectTo: "http://localhost:3000/auth/callback", shouldCreateUser: false },
    );
  });
});

describe("isNoAccountMagicLinkError", () => {
  it("matches the Supabase no-signup refusal by code or message", () => {
    assert.equal(isNoAccountMagicLinkError({ code: "otp_disabled", message: "x" }), true);
    assert.equal(isNoAccountMagicLinkError({ message: "Signups not allowed for otp" }), true);
  });

  it("does not hide real errors", () => {
    assert.equal(isNoAccountMagicLinkError(null), false);
    assert.equal(isNoAccountMagicLinkError({ code: "over_email_send_rate_limit", message: "Too many" }), false);
    assert.equal(isNoAccountMagicLinkError({ message: "captcha verification process failed" }), false);
  });
});

describe("MAGIC_LINK_SENT_MESSAGE", () => {
  it("does not say whether the email has an account and has no em dashes", () => {
    assert.match(MAGIC_LINK_SENT_MESSAGE, /^If this email has a Fan Engage account/);
    assert.doesNotMatch(MAGIC_LINK_SENT_MESSAGE, /\u2014/);
  });
});
