import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RAELYNN_COMMUNITY_PATH,
  legacyGuestRedirect,
} from "./legacy-path-redirects.ts";

const nextConfig = readFileSync(
  fileURLToPath(new URL("../next.config.ts", import.meta.url)),
  "utf8",
);

describe("legacy /shop alias", () => {
  it("redirects /shop and /shop/* to /marketplace", () => {
    assert.match(nextConfig, /source:\s*"\/shop"/);
    assert.match(nextConfig, /source:\s*"\/shop\/:path\*"/);
    assert.match(nextConfig, /destination:\s*"\/marketplace"/);
  });
});

describe("production host canonicalization", () => {
  it("sends the Vercel production alias and apex to https://www.fanengagepro.com via shared rules", () => {
    assert.match(nextConfig, /productionHostRedirectRules\(\)/);
    assert.doesNotMatch(nextConfig, /destination:\s*"https:\/\/fanengagepro\.com/);
  });
});

describe("pricing / plans aliases", () => {
  it("redirects /pricing and /plans to /premium", () => {
    assert.match(nextConfig, /source:\s*"\/pricing"/);
    assert.match(nextConfig, /source:\s*"\/plans"/);
    assert.match(nextConfig, /destination:\s*"\/premium"/);
  });
});

describe("settings alias", () => {
  it("redirects /settings to /me", () => {
    assert.match(nextConfig, /source:\s*"\/settings"/);
    assert.match(nextConfig, /destination:\s*"\/me"/);
  });
});

describe("signup and events aliases", () => {
  it("lists the aliases in next.config as temporary redirects", () => {
    assert.match(nextConfig, /source:\s*"\/create-account"/);
    assert.match(nextConfig, /source:\s*"\/join"/);
    assert.match(nextConfig, /source:\s*"\/events"/);
    assert.match(nextConfig, /destination:\s*"\/signup"/);
    assert.match(nextConfig, /destination:\s*"\/artists\/raelynn\/community"/);
    assert.doesNotMatch(nextConfig, /source:\s*"\/events\/:path\*"/);
    assert.doesNotMatch(nextConfig, /source:\s*"\/artist-portal\/events"/);
  });

  it("sends /create-account and /join to /signup with the full query string", () => {
    assert.equal(legacyGuestRedirect("/join", ""), "/signup");
    assert.equal(legacyGuestRedirect("/join", "?ref=abc"), "/signup?ref=abc");
    assert.equal(
      legacyGuestRedirect("/create-account", "?ref=abc&next=%2Fonboarding"),
      "/signup?ref=abc&next=%2Fonboarding",
    );
    assert.equal(
      legacyGuestRedirect("/join/", "?ref=raelynn"),
      "/signup?ref=raelynn",
    );
    assert.equal(legacyGuestRedirect("/create-account", "ref=abc"), "/signup?ref=abc");
  });

  it("sends /events to the RaeLynn community page, not the artist hub or portal", () => {
    assert.equal(RAELYNN_COMMUNITY_PATH, "/artists/raelynn/community");
    assert.equal(legacyGuestRedirect("/events", ""), RAELYNN_COMMUNITY_PATH);
    assert.equal(
      legacyGuestRedirect("/events", "?ref=abc"),
      `${RAELYNN_COMMUNITY_PATH}?ref=abc`,
    );
    assert.equal(legacyGuestRedirect("/events/", ""), RAELYNN_COMMUNITY_PATH);
    assert.equal(legacyGuestRedirect("/artist-portal/events", ""), null);
    assert.equal(legacyGuestRedirect("/api/events/abc/ics", ""), null);
    assert.equal(legacyGuestRedirect("/artists/raelynn", ""), null);
    assert.equal(legacyGuestRedirect("/signup", "?ref=abc"), null);
  });

  it("runs in middleware before auth and before the missing-Supabase early return", () => {
    const middleware = readFileSync(
      fileURLToPath(new URL("../middleware.ts", import.meta.url)),
      "utf8",
    );
    const legacyAt = middleware.indexOf("legacyGuestRedirect(");
    const earlyAt = middleware.indexOf("if (!url || !anon)");
    const getUserAt = middleware.indexOf("supabase.auth.getUser()");
    assert.ok(legacyAt > 0, "middleware should call legacyGuestRedirect");
    assert.ok(earlyAt > legacyAt);
    assert.ok(getUserAt > legacyAt);
    assert.match(middleware, /NextResponse\.redirect\([\s\S]*307\)/);
  });
});
