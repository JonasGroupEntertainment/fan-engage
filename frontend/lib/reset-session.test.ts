import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isOrdinarySignInSession, resetPageState } from "./reset-session.ts";

function token(claims: unknown): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${body}.signature`;
}
const passwordSession = token({ amr: [{ method: "password", timestamp: 1 }] });

describe("isOrdinarySignInSession", () => {
  it("is true for a password, social or sign-up session", () => {
    for (const method of ["password", "oauth", "sso/saml", "email/signup", "anonymous"]) {
      assert.equal(isOrdinarySignInSession(token({ amr: [{ method, timestamp: 1 }] })), true, method);
    }
    assert.equal(isOrdinarySignInSession(token({ amr: ["password"] })), true);
    assert.equal(
      isOrdinarySignInSession(token({ amr: [{ method: "password" }, { method: "totp" }] })),
      true,
    );
  });

  it("is false for a session an emailed link or code created", () => {
    for (const method of ["recovery", "otp", "magiclink", "invite"]) {
      assert.equal(isOrdinarySignInSession(token({ amr: [{ method, timestamp: 1 }] })), false, method);
    }
    assert.equal(
      isOrdinarySignInSession(token({ amr: [{ method: "password" }, { method: "otp" }] })),
      false,
    );
  });

  it("is false for anything it cannot read, so a real link is never turned away", () => {
    assert.equal(isOrdinarySignInSession(token({})), false);
    assert.equal(isOrdinarySignInSession(token({ amr: [] })), false);
    assert.equal(isOrdinarySignInSession(token({ amr: "password" })), false);
    assert.equal(isOrdinarySignInSession(token({ amr: [{ method: 7 }] })), false);
    assert.equal(isOrdinarySignInSession(token([1, 2])), false);
    for (const bad of [null, undefined, "", "abc", "a.b", "a.!!!.c"]) {
      assert.equal(isOrdinarySignInSession(bad), false);
    }
  });
});

describe("resetPageState", () => {
  it("has nothing to change without a session", () => {
    assert.equal(resetPageState({ linkOpenedHere: false, accessToken: null }), "missing");
    assert.equal(resetPageState({ linkOpenedHere: true, accessToken: "" }), "missing");
  });

  it("lets a link opened on this page through", () => {
    assert.equal(resetPageState({ linkOpenedHere: true, accessToken: passwordSession }), "ready");
  });

  it("sends a password sign-in to ask for a reset link", () => {
    assert.equal(resetPageState({ linkOpenedHere: false, accessToken: passwordSession }), "needs_link");
  });

  it("accepts a session a reset email created on another page", () => {
    const viaCallback = token({ amr: [{ method: "otp", timestamp: 1 }] });
    assert.equal(resetPageState({ linkOpenedHere: false, accessToken: viaCallback }), "ready");
  });
});

describe("reset password form", () => {
  const source = readFileSync(
    new URL("../app/reset-password/reset-password-form.tsx", import.meta.url),
    "utf8",
  );

  it("decides with resetPageState, not on any session at all", () => {
    assert.match(source, /resetPageState\(/);
    assert.doesNotMatch(source, /setSessionState\(session \? "ready" : "missing"\)/);
  });

  it("checks again before saving the new password", () => {
    const submit = source.slice(source.indexOf("async function handleSubmit"));
    assert.match(submit, /resetPageState\(/);
    assert.ok(submit.indexOf("resetPageState(") < submit.indexOf("updateUser("));
  });

  it("has a screen for a signed-in person without a link", () => {
    assert.match(source, /sessionState === "needs_link"/);
  });
});
