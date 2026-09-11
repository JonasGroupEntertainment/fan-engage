import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildPasswordRecoveryOptions } from "./password-recovery-options.ts";

describe("password recovery CAPTCHA binding", () => {
  const redirectTo = "https://example.com/auth/callback?next=%2Freset-password";
  it("passes the unused challenge to the Auth request", () => {
    assert.deepEqual(buildPasswordRecoveryOptions({ redirectTo, turnstileConfigured: true, turnstileToken: " test-token " }), { redirectTo, captchaToken: "test-token" });
  });
  it("blocks missing or blank configured challenges", () => {
    for (const turnstileToken of [null, "", "   "]) {
      assert.throws(() => buildPasswordRecoveryOptions({ redirectTo, turnstileConfigured: true, turnstileToken }));
    }
  });
  it("supports environments without CAPTCHA configured", () => {
    assert.deepEqual(buildPasswordRecoveryOptions({ redirectTo, turnstileConfigured: false, turnstileToken: null }), { redirectTo });
  });
  it("does not consume the token in a separate verification request", () => {
    const source = readFileSync(new URL("../app/forgot-password/forgot-password-form.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /verifyTurnstileToken/);
    assert.match(source, /resetPasswordForEmail\(email.trim\(\), buildPasswordRecoveryOptions/);
    assert.match(source, /finally\s*\{[\s\S]*resetChallenge\(\)/);
  });
});
