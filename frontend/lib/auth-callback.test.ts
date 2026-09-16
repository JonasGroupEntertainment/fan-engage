import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authCallbackCompletePath,
  authCallbackErrorPath,
  authCallbackIncompleteMessage,
  authCallbackUserMessage,
  isAuthEmailOtpType,
  isPkceVerifierMissingError,
  isRecoveryNext,
  parseAuthCallbackSearch,
  resolveAuthCallbackNext,
} from "./auth-callback.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("auth callback search parsing", () => {
  it("keeps PKCE codes and sanitizes next", () => {
    const parsed = parseAuthCallbackSearch(
      new URLSearchParams("code=abc&next=/reset-password"),
    );
    assert.equal(parsed.code, "abc");
    assert.equal(parsed.next, "/reset-password");
    assert.equal(parsed.tokenHash, null);
  });

  it("accepts token_hash recovery without PKCE", () => {
    const parsed = parseAuthCallbackSearch(
      new URLSearchParams("token_hash=hash-1&type=recovery"),
    );
    assert.equal(parsed.tokenHash, "hash-1");
    assert.equal(parsed.type, "recovery");
    assert.equal(parsed.next, "/reset-password");
  });

  it("rejects unknown OTP types and external next paths", () => {
    assert.equal(isAuthEmailOtpType("recovery"), true);
    assert.equal(isAuthEmailOtpType("not-a-type"), false);
    const parsed = parseAuthCallbackSearch(
      new URLSearchParams("token_hash=h&type=nonesuch&next=https://evil.example"),
    );
    assert.equal(parsed.type, null);
    assert.equal(parsed.next, "/");
  });

  it("defaults recovery next only when next is omitted", () => {
    assert.equal(resolveAuthCallbackNext(null, "recovery"), "/reset-password");
    assert.equal(resolveAuthCallbackNext("/onboarding", "recovery"), "/onboarding");
    assert.equal(resolveAuthCallbackNext(null, "magiclink"), "/");
  });
});

describe("PKCE miss and safe redirects", () => {
  it("detects the 2026-08-26 verifier storage error", () => {
    assert.equal(
      isPkceVerifierMissingError("PKCE code verifier not found in storage"),
      true,
    );
    assert.equal(isPkceVerifierMissingError("invalid grant"), false);
  });

  it("sends recovery failures to forgot-password only when that door is open", () => {
    assert.equal(isRecoveryNext("/reset-password"), true);
    assert.equal(
      authCallbackErrorPath({
        next: "/reset-password",
        message: "expired",
        forgotPasswordEnabled: true,
      }),
      "/forgot-password?error=expired",
    );
    assert.equal(
      authCallbackErrorPath({
        next: "/reset-password",
        message: "expired",
        forgotPasswordEnabled: false,
      }),
      "/login?error=expired&next=%2Freset-password",
    );
    assert.equal(
      authCallbackErrorPath({
        next: "/onboarding",
        message: "expired",
        forgotPasswordEnabled: true,
      }),
      "/login?error=expired&next=%2Fonboarding",
    );
  });

  it("keeps the browser complete path internal", () => {
    assert.equal(
      authCallbackCompletePath({
        code: "pkce-code",
        next: "/reset-password",
      }),
      "/auth/complete?code=pkce-code&next=%2Freset-password",
    );
    assert.doesNotMatch(
      authCallbackCompletePath({
        next: "//evil.example",
        tokenHash: "h",
        type: "recovery",
      }),
      /evil/,
    );
  });

  it("uses recovery copy on reset-password next", () => {
    assert.match(authCallbackUserMessage("/reset-password"), /password reset/i);
    assert.match(authCallbackIncompleteMessage("/reset-password"), /incomplete/i);
    assert.match(authCallbackUserMessage("/"), /sign in again/i);
  });
});

describe("auth callback wiring", () => {
  it("server route tries token_hash, copies cookies, and falls back to browser PKCE", () => {
    const route = readRepo("../app/auth/callback/route.ts");
    assert.match(route, /verifyOtp/);
    assert.match(route, /exchangeCodeForSession/);
    assert.match(route, /isPkceVerifierMissingError/);
    assert.match(route, /authCallbackCompletePath/);
    assert.match(route, /createCallbackSupabase/);
    assert.match(route, /applyCookies/);
    assert.match(route, /sanitizeNextPath|parseAuthCallbackSearch/);
    assert.doesNotMatch(route, /fan-engage-pearl\.vercel\.app/);
  });

  it("browser complete page exchanges the code where the PKCE cookie lives", () => {
    const complete = readRepo("../app/auth/complete/complete-client.tsx");
    assert.match(complete, /exchangeCodeForSession/);
    assert.match(complete, /verifyOtp/);
    assert.match(complete, /createClient/);
    assert.match(complete, /window\.location\.replace/);
    assert.doesNotMatch(complete, /fan-engage-pearl\.vercel\.app/);
  });

  it("reset-password can finish PKCE/token_hash in the browser", () => {
    const form = readRepo("../app/reset-password/reset-password-form.tsx");
    assert.match(form, /exchangeCodeForSession/);
    assert.match(form, /verifyOtp/);
    assert.match(form, /searchParams\.get\("code"\)/);
  });

  it("root forwards token_hash as well as code", () => {
    const home = readRepo("../app/page.tsx");
    assert.match(home, /token_hash/);
    assert.match(home, /\/auth\/callback/);
    assert.match(home, /sanitizeNextPath/);
  });

  it("forgot-password surfaces callback errors and still binds Turnstile to Auth", () => {
    const form = readRepo("../app/forgot-password/forgot-password-form.tsx");
    assert.match(form, /searchParams\.get\("error"\)/);
    assert.match(form, /buildPasswordRecoveryOptions/);
    assert.match(form, /resetPasswordForEmail/);
  });
});
