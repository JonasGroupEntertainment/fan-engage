import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SIGNUP_NOT_CREATED_MESSAGE,
  didSignupCreateUser,
  interpretSignupCreate,
} from "./signup-outcome.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("didSignupCreateUser", () => {
  it("treats missing user as a non-create", () => {
    assert.equal(didSignupCreateUser(null), false);
    assert.equal(didSignupCreateUser(undefined), false);
  });

  it("treats empty identities as a silent non-create", () => {
    assert.equal(didSignupCreateUser({ identities: [] }), false);
  });

  it("treats a user with an identity as created", () => {
    assert.equal(didSignupCreateUser({ identities: [{ id: "1" }] }), true);
  });
});

describe("interpretSignupCreate", () => {
  it("stays on signup with a clear error when signUp fails", () => {
    const result = interpretSignupCreate({
      signUpError: "User already registered",
      user: null,
      session: null,
      signInError: null,
      signInSession: null,
    });
    assert.equal(result.action, "stay-error");
    assert.match(result.message, /already registered/i);
  });

  it("does not send a silent non-create to a false-success login path", () => {
    const result = interpretSignupCreate({
      signUpError: null,
      user: { identities: [] },
      session: null,
      signInError: "Invalid login credentials",
      signInSession: null,
    });
    assert.equal(result.action, "stay-error");
    assert.equal(result.message, SIGNUP_NOT_CREATED_MESSAGE);
    assert.doesNotMatch(result.message, /password you just created/i);
  });

  it("stays on signup when create looked ok but password sign-in failed", () => {
    const result = interpretSignupCreate({
      signUpError: null,
      user: { identities: [{ id: "1" }] },
      session: null,
      signInError: "Invalid login credentials",
      signInSession: null,
    });
    assert.equal(result.action, "stay-error");
    assert.match(result.message, /wasn't created|try again/i);
    assert.doesNotMatch(result.message, /password you just created/i);
  });

  it("proceeds only when a session exists", () => {
    assert.equal(
      interpretSignupCreate({
        signUpError: null,
        user: { identities: [{ id: "1" }] },
        session: { access_token: "t" },
        signInError: null,
        signInSession: null,
      }).action,
      "proceed",
    );
    assert.equal(
      interpretSignupCreate({
        signUpError: null,
        user: { identities: [{ id: "1" }] },
        session: null,
        signInError: null,
        signInSession: { access_token: "t" },
      }).action,
      "proceed",
    );
  });
});

describe("signup form stays on /signup after a failed create", () => {
  it("uses interpretSignupCreate and does not set need-signin on a non-create", () => {
    const signup = readRepo("../app/signup/signup-form.tsx");
    assert.match(signup, /interpretSignupCreate/);
    assert.match(signup, /SIGNUP_NOT_CREATED_MESSAGE/);
    const createAt = signup.indexOf("async function createAccount");
    const createFn = signup.slice(createAt, createAt + 1800);
    assert.doesNotMatch(createFn, /setStatus\("need-signin"\)/);
  });
});
