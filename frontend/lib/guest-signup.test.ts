import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { guestSignupHref, isOnboardingPath, sanitizeAppPath } from "./guest-signup.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("sanitizeAppPath", () => {
  it("keeps in-app paths and drops protocol-relative / external", () => {
    assert.equal(sanitizeAppPath("/onboarding"), "/onboarding");
    assert.equal(sanitizeAppPath("/rewards"), "/rewards");
    assert.equal(sanitizeAppPath("//jgos.io"), null);
    assert.equal(sanitizeAppPath("https://jgos.io"), null);
    assert.equal(sanitizeAppPath(null), null);
  });
});

describe("guestSignupHref", () => {
  it("defaults ref=raelynn and next=/onboarding", () => {
    assert.equal(
      guestSignupHref({}),
      "/signup?ref=raelynn&next=%2Fonboarding",
    );
  });

  it("preserves ref and next when present", () => {
    assert.equal(
      guestSignupHref({ ref: "raelynn", next: "/rewards" }),
      "/signup?ref=raelynn&next=%2Frewards",
    );
    assert.equal(
      guestSignupHref({ ref: "raelynn", fallbackNext: "/onboarding" }),
      "/signup?ref=raelynn&next=%2Fonboarding",
    );
  });

  it("never emits jgos.io", () => {
    assert.doesNotMatch(
      guestSignupHref({ next: "//jgos.io", fallbackNext: "/onboarding" }),
      /jgos\.io/,
    );
  });
});

describe("isOnboardingPath", () => {
  it("matches /onboarding and nested mission, not other routes", () => {
    assert.equal(isOnboardingPath("/onboarding"), true);
    assert.equal(isOnboardingPath("/onboarding/mission"), true);
    assert.equal(isOnboardingPath("/login"), false);
    assert.equal(isOnboardingPath("/signup"), false);
  });
});

describe("middleware guest onboarding redirect", () => {
  it("sends unauthenticated /onboarding to /signup via guestSignupHref", () => {
    const middleware = readRepo("../middleware.ts");
    assert.match(middleware, /isOnboardingPath/);
    assert.match(middleware, /guestSignupHref/);
    assert.match(middleware, /searchParams\.get\("ref"\)/);
    assert.match(middleware, /searchParams\.get\("next"\)/);
    assert.match(middleware, /isSignOutPath/);
    assert.doesNotMatch(middleware, /jgos\.io/);
  });
});
