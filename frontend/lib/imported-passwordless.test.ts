import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SIGNUP_EXISTING_ACCOUNT_MESSAGE } from "./signup-outcome.ts";
import {
  IMPORTED_RESET_CHECK_MESSAGE,
  IMPORTED_RESET_FAILED_MESSAGE,
  IMPORTED_RESET_LIMIT_MESSAGE,
  IMPORTED_SET_PASSWORD_MESSAGE,
  findAuthUserByEmail,
  handleImportedAccount,
  isDurableImportAccount,
  isImportedPasswordlessSignup,
  pickAuthUserByEmail,
  postImportedAccount,
  raelynnMembershipRow,
  resolveSignupDeadEnd,
  type AuthUserProbe,
} from "./imported-passwordless.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

/** Shape of the 18 Jun 2026 admin createUser import. No password the fan knows. */
function june18Import(overrides: Partial<AuthUserProbe> = {}): AuthUserProbe {
  return {
    id: "import-fan",
    email: "fan@example.com",
    last_sign_in_at: null,
    email_confirmed_at: "2026-06-18T19:52:00.000Z",
    confirmation_sent_at: null,
    invited_at: null,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { email_verified: true },
    ...overrides,
  };
}

function mockSignUp(user: { identities?: unknown[] } | null, error: string | null = null) {
  return {
    auth: {
      async signUp() {
        return { data: { user, session: null }, error: error ? { message: error } : null };
      },
      async signInWithPassword() {
        return {
          data: { session: null },
          error: { message: "Invalid login credentials" },
        };
      },
    },
  };
}

describe("imported passwordless signup dead end", () => {
  it("keeps the generic copy when signUp returns an existing user and password sign-in fails", async () => {
    const supabase = mockSignUp({ identities: [] });
    const signedUp = await supabase.auth.signUp();
    const signedIn = await supabase.auth.signInWithPassword();
    const decision = resolveSignupDeadEnd({
      signUpError: signedUp.error?.message ?? null,
      user: signedUp.data.user,
      session: signedUp.data.session,
      signInError: signedIn.error?.message ?? null,
      signInSession: signedIn.data.session,
      adminUser: null,
    });
    assert.equal(decision.action, "stay-error");
    assert.equal(decision.message, SIGNUP_EXISTING_ACCOUNT_MESSAGE);
    assert.match(decision.message, /couldn't finish creating that account/i);
    assert.doesNotMatch(decision.message, /already on the list/i);
  });

  it("offers set-password only after the admin lookup confirms the import shape", async () => {
    const supabase = mockSignUp({ identities: [] });
    const signedUp = await supabase.auth.signUp();
    const signedIn = await supabase.auth.signInWithPassword();
    const decision = resolveSignupDeadEnd({
      signUpError: signedUp.error?.message ?? null,
      user: signedUp.data.user,
      session: signedUp.data.session,
      signInError: signedIn.error?.message ?? null,
      signInSession: signedIn.data.session,
      adminUser: june18Import(),
    });
    assert.equal(decision.action, "set-password");
    assert.equal(decision.message, IMPORTED_SET_PASSWORD_MESSAGE);
  });

  it("does not offer set-password for a real account that has signed in", () => {
    const decision = resolveSignupDeadEnd({
      signUpError: null,
      user: { identities: [] },
      session: null,
      signInError: "Invalid login credentials",
      signInSession: null,
      adminUser: june18Import({
        last_sign_in_at: "2026-09-02T00:00:00.000Z",
        confirmation_sent_at: "2026-09-02T00:00:00.000Z",
        user_metadata: { email_verified: true, birth_date: "1990-01-01" },
      }),
    });
    assert.equal(decision.action, "stay-error");
    assert.equal(decision.message, SIGNUP_EXISTING_ACCOUNT_MESSAGE);
  });

  it("does not treat a normal unconfirmed signup as an import", () => {
    const user: AuthUserProbe = {
      email: "new@example.com",
      last_sign_in_at: null,
      email_confirmed_at: null,
      confirmation_sent_at: "2026-10-01T00:00:00.000Z",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { email_verified: false, birth_date: "2000-01-02", consent_version: "2026-08" },
    };
    assert.equal(isImportedPasswordlessSignup(user), false);
    assert.equal(isDurableImportAccount(user), false);
  });
});

describe("import account shape", () => {
  it("matches the June 18 import and a fan_import flag that has never signed in", () => {
    assert.equal(isImportedPasswordlessSignup(june18Import()), true);
    assert.equal(
      isImportedPasswordlessSignup(
        june18Import({
          app_metadata: { fan_import: true, provider: "email" },
          user_metadata: { email_verified: true, source: "csv" },
        }),
      ),
      true,
    );
  });

  it("keeps the durable marker after the recovery session records a sign-in", () => {
    const signedIn = june18Import({ last_sign_in_at: "2026-10-22T00:00:00.000Z" });
    assert.equal(isImportedPasswordlessSignup(signedIn), false);
    assert.equal(isDurableImportAccount(signedIn), true);
  });

  it("ignores a partial email match from the admin filter", () => {
    const picked = pickAuthUserByEmail(
      [
        june18Import({ email: "fan@example.com.evil" }),
        june18Import({ email: "Fan@Example.com", id: "exact" }),
      ],
      " fan@example.com ",
    );
    assert.equal(picked?.id, "exact");
    assert.equal(pickAuthUserByEmail([june18Import({ email: "other@example.com" })], "fan@example.com"), null);
  });
});

describe("imported-account handler", () => {
  const limits = async () => ({ allowed: true as const });

  it("returns set-password for the import and generic for everyone else", async () => {
    const sent: string[] = [];
    const found = await handleImportedAccount({
      action: "classify",
      email: "Fan@Example.com",
      turnstileToken: null,
      turnstileConfigured: true,
      consumeLimit: limits,
      findUser: async () => june18Import(),
      sendReset: async () => null,
    });
    assert.equal(found.status, 200);
    assert.deepEqual(found.body, { outcome: "set-password" });

    const missed = await handleImportedAccount({
      action: "classify",
      email: "someone@example.com",
      turnstileToken: null,
      turnstileConfigured: true,
      consumeLimit: limits,
      findUser: async () => null,
      sendReset: async (email) => {
        sent.push(email);
        return null;
      },
    });
    assert.equal(missed.status, 200);
    assert.equal(missed.body.outcome, "generic");
    assert.deepEqual(sent, []);

    const real = await handleImportedAccount({
      action: "classify",
      email: "real@example.com",
      turnstileToken: null,
      turnstileConfigured: false,
      consumeLimit: limits,
      findUser: async () => june18Import({ last_sign_in_at: "2026-08-01T00:00:00.000Z" }),
      sendReset: async (email) => {
        sent.push(email);
        return null;
      },
    });
    assert.equal(real.body.outcome, "generic");
    assert.deepEqual(sent, []);
  });

  it("sends resetPasswordForEmail only for the import, with the captcha token", async () => {
    const calls: Array<{ email: string; captcha?: string }> = [];
    const result = await handleImportedAccount({
      action: "send-reset",
      email: "fan@example.com",
      turnstileToken: " turnstile-token ",
      turnstileConfigured: true,
      consumeLimit: limits,
      findUser: async () => june18Import(),
      sendReset: async (email, captchaToken) => {
        calls.push({ email, captcha: captchaToken });
        return null;
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.sent, true);
    assert.equal(result.body.outcome, "set-password");
    assert.deepEqual(calls, [{ email: "fan@example.com", captcha: "turnstile-token" }]);
  });

  it("does not send when the lookup is not an import or the challenge is missing", async () => {
    let sends = 0;
    const notImport = await handleImportedAccount({
      action: "send-reset",
      email: "real@example.com",
      turnstileToken: "token",
      turnstileConfigured: true,
      consumeLimit: limits,
      findUser: async () => june18Import({ confirmation_sent_at: "2026-09-01T00:00:00.000Z", user_metadata: { email_verified: true, birth_date: "1991-02-03" } }),
      sendReset: async () => {
        sends += 1;
        return null;
      },
    });
    assert.equal(notImport.body.outcome, "generic");
    assert.equal(notImport.body.sent, false);
    assert.equal(sends, 0);

    const missingChallenge = await handleImportedAccount({
      action: "send-reset",
      email: "fan@example.com",
      turnstileToken: "  ",
      turnstileConfigured: true,
      consumeLimit: limits,
      findUser: async () => {
        throw new Error("lookup should not run");
      },
      sendReset: async () => {
        sends += 1;
        return null;
      },
    });
    assert.equal(missingChallenge.status, 400);
    assert.equal(missingChallenge.body.error, IMPORTED_RESET_CHECK_MESSAGE);
    assert.equal(sends, 0);
  });

  it("rate-limits before lookup and hides GoTrue text", async () => {
    let lookups = 0;
    const limited = await handleImportedAccount({
      action: "classify",
      email: "fan@example.com",
      turnstileToken: null,
      turnstileConfigured: false,
      consumeLimit: async () => ({ allowed: false, reason: "exhausted" }),
      findUser: async () => {
        lookups += 1;
        return june18Import();
      },
      sendReset: async () => null,
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.outcome, "generic");
    assert.equal(limited.body.error, IMPORTED_RESET_LIMIT_MESSAGE);
    assert.equal(lookups, 0);

    const raw = await handleImportedAccount({
      action: "send-reset",
      email: "fan@example.com",
      turnstileToken: null,
      turnstileConfigured: false,
      consumeLimit: limits,
      findUser: async () => june18Import(),
      sendReset: async () => "Database error saving new user for fan@example.com",
    });
    assert.equal(raw.body.error, IMPORTED_RESET_FAILED_MESSAGE);
    assert.doesNotMatch(raw.body.error ?? "", /database|fan@example/i);
  });

  it("stays generic when the admin lookup throws", async () => {
    const result = await handleImportedAccount({
      action: "classify",
      email: "fan@example.com",
      turnstileToken: null,
      turnstileConfigured: false,
      consumeLimit: limits,
      findUser: async () => {
        throw new Error("auth lookup failed");
      },
      sendReset: async () => null,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.outcome, "generic");
  });
});

describe("admin email lookup", () => {
  it("filters the admin API and keeps only an exact email", async () => {
    let requested = "";
    const user = await findAuthUserByEmail("Fan@Example.com", {
      supabaseUrl: "https://example.supabase.co",
      serviceKey: "test-service-key",
      fetch: async (input, init) => {
        requested = String(input);
        assert.equal((init?.headers as { Authorization: string }).Authorization, "Bearer test-service-key");
        return new Response(JSON.stringify({
          users: [
            june18Import({ email: "fan@example.com.evil", id: "partial" }),
            june18Import({ email: "fan@example.com", id: "exact" }),
          ],
        }));
      },
    });
    assert.equal(user?.id, "exact");
    assert.match(requested, /\/auth\/v1\/admin\/users\?/);
    assert.match(requested, /filter=fan%40example\.com/);
  });
});

describe("signup client contract", () => {
  it("posts classify and send-reset without calling Auth from the browser", async () => {
    const bodies: unknown[] = [];
    const classified = await postImportedAccount(
      { email: "fan@example.com", action: "classify" },
      async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ outcome: "set-password" }), { status: 200 });
      },
    );
    assert.equal(classified.body.outcome, "set-password");
    assert.deepEqual(bodies[0], {
      email: "fan@example.com",
      action: "classify",
      turnstileToken: null,
    });

    const signup = readRepo("../app/signup/signup-form.tsx");
    assert.match(signup, /postImportedAccount/);
    assert.match(signup, /action: "classify"/);
    assert.match(signup, /action: "send-reset"/);
    assert.match(signup, /IMPORTED_SET_PASSWORD_MESSAGE/);
    assert.match(signup, /Set your password/);
    assert.doesNotMatch(signup, /resetPasswordForEmail/);
    const route = readRepo("../app/api/auth/imported-account/route.ts");
    assert.match(route, /resetPasswordForEmail/);
    assert.match(route, /authEmailRedirectTo\("\/reset-password"\)/);
    assert.match(route, /captchaToken/);
    assert.match(route, /checkSharedRateLimit/);
    assert.match(route, /for \(const identifier of \[ip, email\]\)/);
    assert.doesNotMatch(route, /verifyTurnstileToken/);
    const handler = readRepo("./imported-passwordless.ts");
    assert.match(handler, /signup-imported-classify/);
    assert.match(handler, /signup-imported-reset/);
  });
});

describe("raelynn membership repair", () => {
  it("upserts an active bronze row and does not assign a founding fan number", () => {
    const row = raelynnMembershipRow("fan-1", "2026-06-18T19:52:00.000Z");
    assert.deepEqual(row, {
      fan_id: "fan-1",
      community_id: "raelynn",
      total_points: 0,
      current_tier: "bronze",
      status: "active",
      joined_at: "2026-06-18T19:52:00.000Z",
    });
    assert.equal("founding_fan_number" in row, false);

    const ensure = readRepo("./ensure-raelynn-membership.ts");
    assert.match(ensure, /ignoreDuplicates: true/);
    assert.match(ensure, /isDurableImportAccount/);
    assert.doesNotMatch(ensure, /claim_founding_fan_status/);
    assert.doesNotMatch(ensure, /founding_fan_number/);

    const callback = readRepo("../app/auth/callback/route.ts");
    assert.match(callback, /ensureImportedFanRaelynnMembership/);
    const login = readRepo("../app/login/login-form.tsx");
    assert.match(login, /ensureImportedFanMembership/);
    const complete = readRepo("../app/auth/complete/complete-client.tsx");
    assert.match(complete, /ensureImportedFanMembership/);
    const reset = readRepo("../app/reset-password/reset-password-form.tsx");
    assert.match(reset, /ensureImportedFanMembership/);
  });
});

describe("0081 backfill migration", () => {
  const sql = readRepo("../../supabase/migrations/0081_imported_fan_raelynn_membership.sql");

  it("is a single idempotent insert that does not assign founding fan numbers", () => {
    assert.match(sql, /NOT applied/i);
    assert.match(sql, /one statement at a time/i);
    assert.match(sql, /Supabase SQL editor/i);
    assert.match(sql, /on conflict \(fan_id, community_id\) do nothing/i);
    assert.match(sql, /'raelynn'/);
    assert.match(sql, /fan_import/);
    assert.match(sql, /email_verified/);
    assert.doesNotMatch(sql, /claim_founding_fan_status/);
    const insertCols = sql.slice(sql.toLowerCase().indexOf("insert"), sql.toLowerCase().indexOf("select"));
    assert.doesNotMatch(insertCols, /founding_fan_number/);
    const code = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.equal(code.match(/;/g)?.length ?? 0, 1);
  });
});
