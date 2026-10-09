import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { adminPolicyGate, guestAdminPolicyRedirect } from "./admin-policy-redirect.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("guest admin policy URLs", () => {
  it("sends a logged-out visitor from /admin/policies/terms to /terms", () => {
    for (const pathname of ["/admin/policies/terms", "/admin/policies/terms/"]) {
      assert.equal(guestAdminPolicyRedirect(pathname), "/terms");
      assert.deepEqual(
        adminPolicyGate({ pathname, signedIn: false, isAdmin: false }),
        { action: "public", to: "/terms", status: 307 },
      );
    }
  });

  it("sends a logged-out visitor from /admin/policies/privacy to /privacy", () => {
    for (const pathname of ["/admin/policies/privacy", "/admin/policies/privacy/"]) {
      assert.equal(guestAdminPolicyRedirect(pathname), "/privacy");
      assert.deepEqual(
        adminPolicyGate({ pathname, signedIn: false, isAdmin: false }),
        { action: "public", to: "/privacy", status: 307 },
      );
    }
  });

  it("still redirects when a query string is present", () => {
    assert.equal(
      guestAdminPolicyRedirect("/admin/policies/privacy?utm=mailchimp"),
      "/privacy",
    );
    assert.deepEqual(
      adminPolicyGate({
        pathname: "/admin/policies/terms/?ref=sms",
        signedIn: false,
        isAdmin: false,
      }),
      { action: "public", to: "/terms", status: 307 },
    );
  });

  it("does not redirect an admin away from the policy editor", () => {
    for (const pathname of ["/admin/policies/terms", "/admin/policies/privacy/"]) {
      assert.deepEqual(
        adminPolicyGate({ pathname, signedIn: true, isAdmin: true }),
        { action: "continue" },
      );
    }
  });

  it("still sends another /admin path to login when logged out", () => {
    for (const pathname of [
      "/admin",
      "/admin/fans",
      "/admin/policies",
      "/admin/policies/cookie_policy",
      "/admin/policies/terms/extra",
    ]) {
      assert.equal(guestAdminPolicyRedirect(pathname), null);
      assert.deepEqual(
        adminPolicyGate({ pathname, signedIn: false, isAdmin: false }),
        { action: "login" },
      );
    }
  });

  it("sends a signed-in non-admin on the Mailchimp URLs to the public page", () => {
    assert.deepEqual(
      adminPolicyGate({
        pathname: "/admin/policies/privacy?from=mailchimp",
        signedIn: true,
        isAdmin: false,
      }),
      { action: "public", to: "/privacy", status: 307 },
    );
  });
});

describe("admin policy redirect wiring", () => {
  it("middleware redirects only logged-out visitors, with 307, before the login wall", () => {
    const middleware = readRepo("../middleware.ts");
    const policyAt = middleware.indexOf("guestAdminPolicyRedirect(pathname)");
    const loginAt = middleware.indexOf('loginUrl.searchParams.set("next", pathname)');
    assert.ok(policyAt > 0);
    assert.ok(loginAt > policyAt);
    const gate = middleware.slice(policyAt - 80, policyAt + 220);
    assert.match(gate, /if \(!user\)/);
    assert.match(gate, /NextResponse\.redirect\(new URL\(policyTarget, request\.url\), 307\)/);
    assert.match(middleware, /if \(isProtected && !user\)/);
  });

  it("admin layout redirects non-admins on those URLs and still gates everyone else", () => {
    const layout = readRepo("../app/admin/layout.tsx");
    assert.match(layout, /if \(!ctx\)/);
    assert.match(layout, /guestAdminPolicyRedirect\(pathname\)/);
    assert.match(layout, /redirect\(policyTarget\)/);
    assert.match(layout, /redirect\("\/login\?next=\/admin"\)/);
    const editor = readRepo("../app/admin/policies/[slug]/page.tsx");
    assert.match(editor, /PolicyEditForm/);
    assert.doesNotMatch(editor, /guestAdminPolicyRedirect/);
  });
});
