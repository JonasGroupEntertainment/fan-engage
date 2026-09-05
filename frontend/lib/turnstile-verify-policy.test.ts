import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { turnstileUpstreamFailOpen } from "./turnstile-verify-policy.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("Turnstile verify fail-open policy", () => {
  it("fails closed for signup and for production", () => {
    assert.equal(
      turnstileUpstreamFailOpen({ failClosedRequest: true, failOpenEnv: undefined }),
      false,
    );
    assert.equal(
      turnstileUpstreamFailOpen({ vercelEnv: "production", failOpenEnv: undefined }),
      false,
    );
    assert.equal(
      turnstileUpstreamFailOpen({ vercelEnv: "preview", failOpenEnv: undefined }),
      true,
    );
    assert.equal(
      turnstileUpstreamFailOpen({ vercelEnv: "preview", failOpenEnv: "0" }),
      false,
    );
  });

  it("verify route rejects missing tokens and uses the policy", () => {
    const route = readRepo("../app/api/turnstile/verify/route.ts");
    assert.match(route, /missing_token/);
    assert.match(route, /turnstileUpstreamFailOpen/);
    assert.match(route, /failClosed/);
    assert.match(route, /if \(!rl\.allowed\)/);
    assert.match(route, /rl\.reason === "backend_unavailable"/);
    assert.doesNotMatch(route, /if \(!rl\.success\)/);
  });

  it("signup binds the unconsumed token to Supabase Auth", () => {
    const signup = readRepo("../app/signup/signup-form.tsx");
    assert.match(signup, /buildSignupAuthOptions/);
    assert.match(signup, /turnstileToken,/);
    assert.doesNotMatch(signup, /verifyTurnstileToken/);
  });
});
