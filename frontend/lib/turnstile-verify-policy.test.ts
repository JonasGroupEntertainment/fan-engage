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
  });

  it("signup never treats fail-open as a create grant", () => {
    const signup = readRepo("../app/signup/signup-form.tsx");
    assert.doesNotMatch(signup, /You can still create an account/);
    assert.doesNotMatch(signup, /failOpenGranted/);
    assert.doesNotMatch(signup, /gate === "fail-open"/);
  });
});
