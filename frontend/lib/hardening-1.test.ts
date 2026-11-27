import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { REACTION_SET, isAllowedReaction } from "./community/reactions.ts";
import { safeAppPath } from "./safe-app-path.ts";
import { SIGNUP_EMAIL_IN_USE_MESSAGE } from "./signup-outcome.ts";

/**
 * Wiring tests for the first set of hardening changes ported from Brand
 * Engage Pro. Each reads the source of the place a rule is applied.
 */

function read(relFromFrontend: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relFromFrontend}`, import.meta.url)), "utf8");
}

describe("signing out needs a button press on this site", () => {
  const route = read("app/auth/signout/route.ts");

  it("opening a sign-out address only leads to the confirm page", () => {
    // Arrange
    const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));

    // Assert
    assert.match(get, /return signOutConfirmRedirect\(request\);/);
    assert.doesNotMatch(get, /signOutAndRedirect/);
  });

  it("the confirm redirect ends no session and clears no cookie", () => {
    // Arrange
    const start = route.indexOf("function signOutConfirmRedirect");
    const confirm = route.slice(start, route.indexOf("}", start));

    // Assert
    assert.doesNotMatch(confirm, /signOut\(|cookies\.set/);
  });

  it("the real sign-out checks the request came from this site first", () => {
    // Arrange
    const start = route.indexOf("async function signOutAndRedirect");
    const body = route.slice(start);
    const check = body.indexOf("isSameOriginRequest(sameOriginHeadersOf(request.headers))");
    const signOut = body.indexOf("supabase.auth.signOut()");

    // Assert
    assert.notEqual(check, -1);
    assert.ok(check < signOut);
  });

  it("the confirm page posts to /logout", () => {
    assert.match(read("app/logout/confirm/page.tsx"), /<form method="post" action="\/logout">/);
  });

  it("the menu posts the form and never opens /logout as a plain link", () => {
    // Arrange
    const menu = read("components/user-menu.tsx");

    // Assert
    assert.match(menu, /form\.submit\(\);/);
    assert.doesNotMatch(menu, /window\.location\.assign\("\/logout"\)/);
  });
});

describe("the inbox only follows a link to this site", () => {
  it("uses the shared path check", () => {
    // Arrange
    const actions = read("app/inbox/actions.ts");

    // Assert
    assert.match(actions, /const target = safeAppPath\(redirectTo\);/);
    assert.doesNotMatch(actions, /redirectTo\.startsWith\("\/"\)/);
  });

  it("the path check refuses another site written as a path", () => {
    assert.equal(safeAppPath("//example.com"), null);
    assert.equal(safeAppPath("/\\example.com"), null);
    assert.equal(safeAppPath("https://example.com"), null);
    assert.equal(safeAppPath("/artists/raelynn/community"), "/artists/raelynn/community");
  });
});

describe("only the offered reactions are stored", () => {
  it("accepts each reaction the buttons offer", () => {
    for (const emoji of REACTION_SET) assert.equal(isAllowedReaction(emoji), true);
  });

  it("refuses anything else", () => {
    assert.equal(isAllowedReaction("free tickets at example.com"), false);
    assert.equal(isAllowedReaction(""), false);
    assert.equal(isAllowedReaction(null), false);
  });

  it("the action checks before it reads or writes", () => {
    // Arrange
    const actions = read("app/artists/[slug]/community/actions.ts");
    const start = actions.indexOf("export async function toggleReactionAction");
    const body = actions.slice(start, actions.indexOf("export async function", start + 10));

    // Assert
    assert.ok(body.indexOf("if (!isAllowedReaction(emoji)) return;") < body.indexOf("await requireUser()"));
  });

  it("the buttons and the action share one list", () => {
    assert.match(read("app/artists/[slug]/community/post-card.tsx"), /import \{ REACTION_SET \} from "@\/lib\/community\/reactions";/);
  });
});

describe("an uploaded picture is judged by its contents", () => {
  const route = read("app/api/upload/route.ts");

  it("reads the first bytes and refuses a file that is not an image", () => {
    assert.match(route, /const realType = sniffImageType\(head\);/);
    assert.match(route, /if \(!realType\) \{/);
  });

  it("checks before anything is stored", () => {
    assert.ok(route.indexOf("sniffImageType(head)") < route.indexOf(".upload(path, file"));
  });

  it("names the stored file from the type it found", () => {
    assert.match(route, /imageFileName\(safeFilename\(file\.name\), realType\)/);
  });

  it("stores the type it found, not the type the browser stated", () => {
    assert.match(route, /contentType: realType,/);
    assert.doesNotMatch(route, /contentType: file\.type,/);
  });
});

describe("the privacy switch only says Saved when it saved", () => {
  it("the action reports failure, including when no row changed", () => {
    // Arrange
    const action = read("app/me/privacy/actions.ts");

    // Assert
    assert.match(action, /\.select\("id"\);/);
    assert.match(action, /if \(error \|\| !data \|\| data\.length === 0\) \{/);
    assert.match(action, /return \{ ok: false, error: PRIVACY_SAVE_FAILED \};/);
  });

  it("the switch goes back and shows the reason when the save fails", () => {
    // Arrange
    const form = read("app/me/privacy/privacy-form.tsx");

    // Assert
    assert.match(form, /setPublicProfile\(previous\);/);
    assert.match(form, /savedAt && !pending && !error/);
  });
});

describe("the site security header", () => {
  it("allows no plugins and no base tag pointing elsewhere", () => {
    // Arrange
    const config = read("next.config.ts");

    // Assert
    assert.match(config, /object-src 'none'/);
    assert.match(config, /base-uri 'self'/);
    assert.match(config, /frame-ancestors 'none'/);
  });
});

describe("the sign-up page does not confirm who has an account", () => {
  it("uses wording that is true whether or not the email is known", () => {
    assert.match(SIGNUP_EMAIL_IN_USE_MESSAGE, /^If you already have an account/);
    assert.doesNotMatch(SIGNUP_EMAIL_IN_USE_MESSAGE, /is already in use|already registered|already exists/i);
  });
});
