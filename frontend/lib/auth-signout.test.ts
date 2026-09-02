import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SIGNOUT_PATHS,
  SIGNOUT_REDIRECT_PATH,
  isSignOutPath,
  isSupabaseAuthCookie,
  signOutCookieNames,
} from "./auth-signout.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("sign-out paths", () => {
  it("recognizes /logout, /signout, and /auth/signout", () => {
    assert.deepEqual([...SIGNOUT_PATHS], ["/auth/signout", "/logout", "/signout"]);
    assert.equal(isSignOutPath("/logout"), true);
    assert.equal(isSignOutPath("/signout"), true);
    assert.equal(isSignOutPath("/auth/signout"), true);
    assert.equal(isSignOutPath("/login"), false);
    assert.equal(isSignOutPath("/auth/callback"), false);
  });

  it("lands signed-out fans on /", () => {
    assert.equal(SIGNOUT_REDIRECT_PATH, "/");
  });
});

describe("Supabase auth cookie names", () => {
  it("matches chunked sb- auth-token cookies and ignores others", () => {
    assert.equal(isSupabaseAuthCookie("sb-uhovonrljcauaoctypbg-auth-token"), true);
    assert.equal(isSupabaseAuthCookie("sb-uhovonrljcauaoctypbg-auth-token.0"), true);
    assert.equal(isSupabaseAuthCookie("sb-uhovonrljcauaoctypbg-auth-token-code-verifier"), true);
    assert.equal(isSupabaseAuthCookie("fanengage_ref"), false);
    assert.equal(isSupabaseAuthCookie("sb-other"), false);
  });

  it("collects every auth cookie present on the request", () => {
    assert.deepEqual(
      signOutCookieNames([
        { name: "fanengage_ref" },
        { name: "sb-proj-auth-token" },
        { name: "sb-proj-auth-token.0" },
      ]),
      ["sb-proj-auth-token", "sb-proj-auth-token.0"],
    );
  });
});

describe("sign-out wiring", () => {
  it("middleware skips session refresh on sign-out so cookies can be cleared", () => {
    const middleware = readRepo("../middleware.ts");
    assert.match(middleware, /isSignOutPath/);
    assert.match(middleware, /SIGNOUT_PATHS|isSignOutPath\(/);
  });

  it("user menu signs out on the client and hits a working sign-out path", () => {
    const menu = readRepo("../components/user-menu.tsx");
    assert.match(menu, /signOut\(/);
    assert.match(menu, /\/logout/);
  });

  it("GET and POST exist for /logout, /signout, and /auth/signout", () => {
    const auth = readRepo("../app/auth/signout/route.ts");
    const logout = readRepo("../app/logout/route.ts");
    const signout = readRepo("../app/signout/route.ts");
    assert.match(auth, /export async function GET/);
    assert.match(auth, /export async function POST/);
    assert.match(logout, /from "@\/app\/auth\/signout\/route"/);
    assert.match(signout, /from "@\/app\/auth\/signout\/route"/);
  });
});
