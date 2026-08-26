import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_URL,
  CANONICAL_PRODUCTION_APP_URL,
  authEmailRedirectTo,
  resolveAppUrl,
} from "./app-url.ts";
import { CANONICAL_PRODUCTION_ORIGIN } from "./canonical-host.ts";

const PEARL = "https://fan-engage-pearl.vercel.app";
const PREVIEW_HOST = "fan-engage-git-fix-auth-jonas-group.vercel.app";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("resolveAppUrl — production must not emit pearl / VERCEL_URL", () => {
  it("APP_URL origin matches the www host-redirect origin", () => {
    assert.equal(CANONICAL_PRODUCTION_APP_URL, CANONICAL_PRODUCTION_ORIGIN);
    assert.equal(CANONICAL_PRODUCTION_APP_URL, "https://www.fanengagepro.com");
  });

  const productionCases: Array<{ name: string; env: Parameters<typeof resolveAppUrl>[0] }> = [
    { name: "unset env", env: { VERCEL_ENV: "production" } },
    {
      name: "NEXT_PUBLIC_APP_URL=pearl",
      env: { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: PEARL },
    },
    {
      name: "NEXT_PUBLIC_SITE_URL=pearl",
      env: { VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: PEARL },
    },
    {
      name: "VERCEL_URL=pearl alias",
      env: { VERCEL_ENV: "production", VERCEL_URL: "fan-engage-pearl.vercel.app" },
    },
    {
      name: "apex fanengagepro.com",
      env: { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://fanengagepro.com" },
    },
    {
      name: "www already set",
      env: { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: CANONICAL_PRODUCTION_APP_URL },
    },
    {
      name: "trailing slash apex",
      env: { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://fanengagepro.com/" },
    },
  ];

  for (const { name, env } of productionCases) {
    it(`production ${name} → www and no pearl`, () => {
      const url = resolveAppUrl(env);
      assert.equal(url, CANONICAL_PRODUCTION_APP_URL);
      assert.doesNotMatch(url, /fan-engage-pearl\.vercel\.app/);
      assert.doesNotMatch(authEmailRedirectTo("/", url), /fan-engage-pearl\.vercel\.app/);
      assert.equal(
        authEmailRedirectTo("/onboarding", url),
        `${CANONICAL_PRODUCTION_APP_URL}/auth/callback?next=${encodeURIComponent("/onboarding")}`,
      );
    });
  }

  it("default APP_URL used by auth pages is not pearl", () => {
    assert.doesNotMatch(APP_URL, /fan-engage-pearl\.vercel\.app/);
    assert.doesNotMatch(authEmailRedirectTo("/"), /fan-engage-pearl\.vercel\.app/);
  });
});

describe("resolveAppUrl — preview may keep Vercel preview host", () => {
  it("uses VERCEL_URL on preview when public URL is unset", () => {
    assert.equal(
      resolveAppUrl({ VERCEL_ENV: "preview", VERCEL_URL: PREVIEW_HOST }),
      `https://${PREVIEW_HOST}`,
    );
  });

  it("still remaps the production pearl alias on preview", () => {
    assert.equal(
      resolveAppUrl({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_APP_URL: PEARL,
      }),
      CANONICAL_PRODUCTION_APP_URL,
    );
  });
});

describe("authEmailRedirectTo", () => {
  it("sanitizes protocol-relative next paths", () => {
    assert.equal(
      authEmailRedirectTo("//evil.example", CANONICAL_PRODUCTION_APP_URL),
      `${CANONICAL_PRODUCTION_APP_URL}/auth/callback?next=${encodeURIComponent("/")}`,
    );
  });
});

describe("auth call sites use authEmailRedirectTo / APP_URL", () => {
  it("login, signup, forgot-password, and callback do not hardcode pearl", () => {
    const files = {
      login: readRepo("../app/login/login-form.tsx"),
      signup: readRepo("../app/signup/signup-form.tsx"),
      forgot: readRepo("../app/forgot-password/page.tsx"),
      callback: readRepo("../app/auth/callback/route.ts"),
    };
    for (const [name, src] of Object.entries(files)) {
      assert.doesNotMatch(src, /fan-engage-pearl\.vercel\.app/, `${name} hardcodes pearl`);
    }
    assert.match(files.login, /authEmailRedirectTo\(next\)/);
    assert.match(files.signup, /authEmailRedirectTo\(onboardingHref\)/);
    assert.match(files.forgot, /authEmailRedirectTo\("\/reset-password"\)/);
    assert.match(files.callback, /APP_URL/);
  });

  it("password login stays Turnstile-free", () => {
    const login = readRepo("../app/login/login-form.tsx");
    const passwordFn = login.slice(
      login.indexOf("async function handlePassword"),
      login.indexOf("const magicGate"),
    );
    assert.match(passwordFn, /signInWithPassword/);
    assert.doesNotMatch(passwordFn, /turnstile|verifyTurnstileToken|Turnstile/i);
    assert.match(login, /Primary door: email \+ password\. No Turnstile/);
  });
});
