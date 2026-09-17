import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isForgotPasswordEnabled, isMagicLinkEnabled } from "./auth-doors.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("isMagicLinkEnabled", () => {
  it("is off in production unless explicitly enabled", () => {
    assert.equal(isMagicLinkEnabled({ VERCEL_ENV: "production" }), false);
    assert.equal(
      isMagicLinkEnabled({ NEXT_PUBLIC_VERCEL_ENV: "production" }),
      false,
    );
    assert.equal(
      isMagicLinkEnabled({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_MAGIC_LINK_ENABLED: "true",
      }),
      true,
    );
    assert.equal(
      isMagicLinkEnabled({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_MAGIC_LINK_ENABLED: "false",
      }),
      false,
    );
  });

  it("stays available on preview/dev so PKCE can be proven", () => {
    assert.equal(isMagicLinkEnabled({ VERCEL_ENV: "preview" }), true);
    assert.equal(isMagicLinkEnabled({ VERCEL_ENV: "development" }), true);
    assert.equal(isMagicLinkEnabled({}), true);
  });

  it("does not default isMagicLinkEnabled to process.env (Next production tsc rejects that)", () => {
    const src = readRepo("./auth-doors.ts");
    assert.doesNotMatch(src, /env:\s*AuthDoorsEnv\s*=\s*process\.env/);
  });
});

describe("isForgotPasswordEnabled", () => {
  it("is off in production unless explicitly enabled", () => {
    assert.equal(isForgotPasswordEnabled({ VERCEL_ENV: "production" }), false);
    assert.equal(
      isForgotPasswordEnabled({ NEXT_PUBLIC_VERCEL_ENV: "production" }),
      false,
    );
    assert.equal(
      isForgotPasswordEnabled({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED: "true",
      }),
      true,
    );
    assert.equal(
      isForgotPasswordEnabled({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED: "false",
      }),
      false,
    );
  });

  it("stays available on preview/dev so recovery can be proven", () => {
    assert.equal(isForgotPasswordEnabled({ VERCEL_ENV: "preview" }), true);
    assert.equal(isForgotPasswordEnabled({ VERCEL_ENV: "development" }), true);
    assert.equal(isForgotPasswordEnabled({}), true);
  });
});

describe("login / signup doors", () => {
  it("production login gates the magic-link CTA and never leaves a dead OTP button", () => {
    const page = readRepo("../app/login/page.tsx");
    const form = readRepo("../app/login/login-form.tsx");
    assert.match(page, /isMagicLinkEnabled\(\)/);
    assert.match(form, /magicLinkEnabled/);
    assert.match(form, /signInWithPassword/);
    assert.match(form, /if\s*\(\s*!magicLinkEnabled\s*\)\s*return/);
    assert.match(form, /magicLinkEnabled\s*&&\s*\(/);
    assert.match(form, /signInWithOtp/);
    assert.doesNotMatch(form, /fan-engage-pearl\.vercel\.app/);
  });

  it("production /forgot-password is not a public reset form", () => {
    const page = readRepo("../app/forgot-password/page.tsx");
    assert.match(page, /isForgotPasswordEnabled\(\)/);
    assert.match(page, /notFound\(\)/);
    assert.doesNotMatch(page, /resetPasswordForEmail/);
    assert.doesNotMatch(page, /TurnstileWidget/);
    const form = readRepo("../app/forgot-password/forgot-password-form.tsx");
    assert.match(form, /resetPasswordForEmail/);
  });

  it("no public /magic-link route", () => {
    const login = readRepo("../app/login/page.tsx");
    assert.match(login, /isMagicLinkEnabled\(\)/);
    assert.doesNotMatch(readRepo("../app/login/login-form.tsx"), /href="\/magic-link"/);
  });

  it("production login hides the forgot-password link", () => {
    const page = readRepo("../app/login/page.tsx");
    const form = readRepo("../app/login/login-form.tsx");
    assert.match(page, /isForgotPasswordEnabled\(\)/);
    assert.match(form, /forgotPasswordEnabled/);
    assert.match(form, /Forgot password\?/);
    assert.match(form, /forgotPasswordEnabled\s*&&/);
    assert.match(form, /href="\/forgot-password"/);
  });

  it("signup has no magic-link / email-me-a-link CTA", () => {
    const signup = readRepo("../app/signup/signup-form.tsx");
    assert.doesNotMatch(signup, /signInWithOtp/);
    assert.doesNotMatch(signup, /Email me a magic link/i);
    assert.doesNotMatch(signup, /email me a link/i);
    assert.match(signup, /signUp\(/);
  });

  it("signup success path does not instruct clicking a confirmation email", () => {
    const signup = readRepo("../app/signup/signup-form.tsx");
    assert.match(signup, /signInWithPassword/);
    assert.match(signup, /Sign in with the password you just created/);
    assert.doesNotMatch(signup, /Almost there/i);
    assert.doesNotMatch(signup, /check your email/i);
    assert.doesNotMatch(signup, /confirmation link/i);
    assert.doesNotMatch(signup, /confirm your email/i);
    assert.doesNotMatch(signup, /Resend confirmation email/i);
    assert.doesNotMatch(signup, /newest (one|link)/i);
  });
});
