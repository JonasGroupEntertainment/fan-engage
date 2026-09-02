import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  hasSupabaseAuthCookies,
  onboardingClientGate,
  shouldRedirectGuestFromOnboarding,
} from "./session-presence.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("hasSupabaseAuthCookies", () => {
  it("detects sb-* auth-token cookies including chunks", () => {
    assert.equal(hasSupabaseAuthCookies([{ name: "sb-abc-auth-token" }]), true);
    assert.equal(hasSupabaseAuthCookies([{ name: "sb-abc-auth-token.0" }]), true);
    assert.equal(hasSupabaseAuthCookies([{ name: "theme" }]), false);
    assert.equal(hasSupabaseAuthCookies([]), false);
  });
});

describe("shouldRedirectGuestFromOnboarding", () => {
  it("keeps a confirmed user on onboarding", () => {
    assert.equal(
      shouldRedirectGuestFromOnboarding({
        user: { id: "u1" },
        cookies: [],
      }),
      false,
    );
  });

  it("does not bounce when auth cookies exist even if getUser is null", () => {
    assert.equal(
      shouldRedirectGuestFromOnboarding({
        user: null,
        cookies: [{ name: "sb-xxx-auth-token" }],
      }),
      false,
    );
  });

  it("still sends true guests (no user, no auth cookies) to signup", () => {
    assert.equal(
      shouldRedirectGuestFromOnboarding({
        user: null,
        cookies: [{ name: "cookie-consent" }],
      }),
      true,
    );
  });
});

describe("onboardingClientGate", () => {
  it("never flips a server-confirmed session to signed-out", () => {
    assert.equal(
      onboardingClientGate({ serverConfirmed: true, clientUser: null }),
      "ready",
    );
  });

  it("shows the guest gate only when the server did not confirm a session", () => {
    assert.equal(
      onboardingClientGate({ serverConfirmed: false, clientUser: null }),
      "signed-out",
    );
    assert.equal(
      onboardingClientGate({
        serverConfirmed: false,
        clientUser: { id: "u1" },
      }),
      "ready",
    );
  });
});

describe("onboarding + middleware honor session cookies", () => {
  it("middleware uses shouldRedirectGuestFromOnboarding instead of bare !user", () => {
    const middleware = readRepo("../middleware.ts");
    assert.match(middleware, /shouldRedirectGuestFromOnboarding/);
    assert.match(middleware, /request\.cookies\.getAll\(\)/);
  });

  it("server onboarding page stays when auth cookies exist", () => {
    const page = readRepo("../app/onboarding/page.tsx");
    assert.match(page, /shouldRedirectGuestFromOnboarding|hasSupabaseAuthCookies/);
    assert.doesNotMatch(page, /redirect\("\/login/);
  });

  it("wizard does not override a server-confirmed session to signed-out", () => {
    const wizard = readRepo("../app/onboarding/onboarding-wizard.tsx");
    assert.match(wizard, /onboardingClientGate|serverConfirmed/);
    assert.match(wizard, /sessionConfirmed/);
  });
});
