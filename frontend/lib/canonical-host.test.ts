import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_PRODUCTION_ORIGIN,
  PRODUCTION_APEX_HOST,
  PRODUCTION_VERCEL_ALIAS_HOST,
  PRODUCTION_VERCEL_NAME_HOST,
  PRODUCTION_VERCEL_PROJECT_HOST,
  hostnameFromHostHeader,
  productionHostRedirect,
  productionHostRedirectRules,
  requestHostname,
} from "./canonical-host.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("hostnameFromHostHeader", () => {
  it("strips port and uses the first x-forwarded-host value", () => {
    assert.equal(hostnameFromHostHeader("fanengagepro.com:443"), PRODUCTION_APEX_HOST);
    assert.equal(
      hostnameFromHostHeader("fan-engage-pearl.vercel.app, www.fanengagepro.com"),
      PRODUCTION_VERCEL_ALIAS_HOST,
    );
    assert.equal(hostnameFromHostHeader(undefined), "");
  });
});

describe("productionHostRedirect — pearl and apex 308 to the same path on www", () => {
  const cases: Array<{ host: string; path: string; search?: string; dest: string }> = [
    {
      host: PRODUCTION_VERCEL_ALIAS_HOST,
      path: "/login",
      dest: `${CANONICAL_PRODUCTION_ORIGIN}/login`,
    },
    {
      host: PRODUCTION_APEX_HOST,
      path: "/login",
      dest: `${CANONICAL_PRODUCTION_ORIGIN}/login`,
    },
    {
      host: PRODUCTION_VERCEL_PROJECT_HOST,
      path: "/login",
      dest: `${CANONICAL_PRODUCTION_ORIGIN}/login`,
    },
    {
      host: PRODUCTION_VERCEL_NAME_HOST,
      path: "/",
      dest: `${CANONICAL_PRODUCTION_ORIGIN}/`,
    },
    {
      host: PRODUCTION_VERCEL_ALIAS_HOST,
      path: "/auth/callback",
      search: "?next=%2Fonboarding",
      dest: `${CANONICAL_PRODUCTION_ORIGIN}/auth/callback?next=%2Fonboarding`,
    },
    {
      host: PRODUCTION_APEX_HOST,
      path: "/signup",
      search: "next=/onboarding",
      dest: `${CANONICAL_PRODUCTION_ORIGIN}/signup?next=/onboarding`,
    },
    {
      host: `${PRODUCTION_APEX_HOST}:443`,
      path: "/",
      dest: `${CANONICAL_PRODUCTION_ORIGIN}/`,
    },
  ];

  for (const { host, path, search, dest } of cases) {
    it(`${host} ${path}${search ?? ""} → www`, () => {
      assert.equal(productionHostRedirect(host, path, search), dest);
    });
  }

  it("does not redirect www, preview, or localhost", () => {
    assert.equal(productionHostRedirect("www.fanengagepro.com", "/login"), null);
    assert.equal(
      productionHostRedirect("fan-engage-git-fix-auth-jonas-group.vercel.app", "/login"),
      null,
    );
    assert.equal(productionHostRedirect("localhost:3000", "/login"), null);
  });

  it("never emits an apex destination", () => {
    assert.doesNotMatch(
      productionHostRedirect(PRODUCTION_VERCEL_ALIAS_HOST, "/login") ?? "",
      /^https:\/\/fanengagepro\.com(?:\/|$)/,
    );
    assert.doesNotMatch(
      productionHostRedirect(PRODUCTION_APEX_HOST, "/login") ?? "",
      /^https:\/\/fanengagepro\.com(?:\/|$)/,
    );
  });
});

describe("requestHostname prefers x-forwarded-host", () => {
  it("reads forwarded host before Host", () => {
    const headers = {
      get(name: string) {
        if (name === "x-forwarded-host") return PRODUCTION_APEX_HOST;
        if (name === "host") return "localhost:3000";
        return null;
      },
    };
    assert.equal(requestHostname(headers), PRODUCTION_APEX_HOST);
  });
});

describe("productionHostRedirectRules for next.config", () => {
  it("308s pearl, project aliases, and apex to www, never www to apex", () => {
    const rules = productionHostRedirectRules();
    assert.equal(rules.length, 8);
    const hosts = new Set(rules.map((r) => r.has[0].value));
    assert.ok(hosts.has(PRODUCTION_VERCEL_ALIAS_HOST));
    assert.ok(hosts.has(PRODUCTION_VERCEL_PROJECT_HOST));
    assert.ok(hosts.has(PRODUCTION_VERCEL_NAME_HOST));
    assert.ok(hosts.has(PRODUCTION_APEX_HOST));
    for (const rule of rules) {
      assert.equal(rule.permanent, true);
      assert.match(rule.destination, /^https:\/\/www\.fanengagepro\.com\//);
      assert.doesNotMatch(rule.destination, /fan-engage-pearl\.vercel\.app/);
      assert.doesNotMatch(rule.destination, /fan-engage\.vercel\.app/);
      assert.notEqual(rule.has[0].value, "www.fanengagepro.com");
    }
  });
});

describe("next.config and middleware use the shared host redirect helper", () => {
  it("next.config spreads productionHostRedirectRules and does not 308 www to apex", () => {
    const nextConfig = readRepo("../next.config.ts");
    assert.match(nextConfig, /productionHostRedirectRules\(\)/);
    assert.doesNotMatch(
      nextConfig,
      /has:\s*\[\s*\{\s*type:\s*"host",\s*value:\s*"www\.fanengagepro\.com"/,
    );
    assert.doesNotMatch(
      nextConfig,
      /destination:\s*"https:\/\/fanengagepro\.com/,
    );
  });

  it("middleware 308s via productionHostRedirect before other work", () => {
    const middleware = readRepo("../middleware.ts");
    assert.match(middleware, /productionHostRedirect\(/);
    assert.match(middleware, /NextResponse\.redirect\(\s*hostRedirect,\s*308\s*\)/);
  });
});
