import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  hasSupabaseAuthCookies,
  hasSupabaseAuthCookiesFromHeader,
  missionClientGate,
  onboardingClientGate,
  shouldRedirectGuestFromOnboarding,
  signedInLoginRedirectPath,
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

describe("hasSupabaseAuthCookiesFromHeader", () => {
  it("parses document.cookie / Cookie header names", () => {
    assert.equal(
      hasSupabaseAuthCookiesFromHeader("theme=dark; sb-xxx-auth-token=abc"),
      true,
    );
    assert.equal(
      hasSupabaseAuthCookiesFromHeader("sb-xxx-auth-token.0=chunk"),
      true,
    );
    assert.equal(hasSupabaseAuthCookiesFromHeader("theme=dark"), false);
    assert.equal(hasSupabaseAuthCookiesFromHeader(""), false);
  });
});

describe("missionClientGate", () => {
  it("stays ready when auth cookies exist even if getUser is null", () => {
    assert.equal(
      missionClientGate({
        clientUser: null,
        cookieHeader: "sb-xxx-auth-token=present",
      }),
      "ready",
    );
  });

  it("shows the guest gate only without a user and without auth cookies", () => {
    assert.equal(
      missionClientGate({ clientUser: null, cookieHeader: "theme=dark" }),
      "signed-out",
    );
    assert.equal(
      missionClientGate({
        clientUser: { id: "u1" },
        cookieHeader: "",
      }),
      "ready",
    );
  });
});

describe("signedInLoginRedirectPath", () => {
  it("sends a confirmed user to the sanitized next path", () => {
    assert.equal(
      signedInLoginRedirectPath({
        user: { id: "u1" },
        cookies: [],
        nextPath: "/onboarding",
      }),
      "/onboarding",
    );
    assert.equal(
      signedInLoginRedirectPath({
        user: { id: "u1" },
        cookies: [],
        nextPath: "https://evil.example/phish",
      }),
      "/",
    );
  });

  it("does not leave /login for a true guest", () => {
    assert.equal(
      signedInLoginRedirectPath({
        user: null,
        cookies: [{ name: "theme" }],
        nextPath: "/onboarding",
      }),
      null,
    );
  });

  it("cookie-present getUser miss follows onboarding/home next, not protected", () => {
    assert.equal(
      signedInLoginRedirectPath({
        user: null,
        cookies: [{ name: "sb-xxx-auth-token" }],
        nextPath: "/onboarding/mission",
      }),
      "/onboarding/mission",
    );
    assert.equal(
      signedInLoginRedirectPath({
        user: null,
        cookies: [{ name: "sb-xxx-auth-token" }],
        nextPath: "/inbox",
      }),
      "/onboarding",
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

  it("mission does not treat a cookie-present getUser miss as Sign in → /login", () => {
    const missionPage = readRepo("../app/onboarding/mission/page.tsx");
    const missionClient = readRepo("../app/onboarding/mission/mission-client.tsx");
    assert.match(missionPage, /shouldRedirectGuestFromOnboarding|hasSupabaseAuthCookies/);
    assert.doesNotMatch(missionPage, /redirect\("\/login/);
    assert.match(missionClient, /missionClientGate|onboardingClientGate|sessionConfirmed/);
    assert.doesNotMatch(missionClient, /href="\/login/);
  });

  it("login bounces an already signed-in visitor off /login", () => {
    const loginPage = readRepo("../app/login/page.tsx");
    const loginForm = readRepo("../app/login/login-form.tsx");
    assert.match(loginPage, /signedInLoginRedirectPath/);
    assert.match(loginForm, /signedInLoginRedirectPath/);
  });

  it("wizard finish error does not send a signed-in fan to /login", () => {
    const wizard = readRepo("../app/onboarding/onboarding-wizard.tsx");
    assert.doesNotMatch(
      wizard,
      /finishStatus === "error"[\s\S]*href="\/login"/,
    );
  });
});
