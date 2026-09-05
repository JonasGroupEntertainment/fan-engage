# Authentication Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind Turnstile verification to Supabase account creation and replace process-local authentication limits with a shared Supabase-backed decision.

**Architecture:** Password signup sends the unconsumed Cloudflare token to Supabase Auth as `captchaToken`, making the Auth service the enforcement boundary. A private PostgreSQL counter and service-role-only RPC provide atomic, cross-instance limits for Fan Engage authentication endpoints; a server-only TypeScript adapter hashes identifiers and fails closed on backend errors.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Auth/Postgres, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-launch-hardening-design.md`

## Global Constraints

- Do not change production Supabase, Vercel, Stripe, or GitHub settings during implementation.
- Do not store raw IP addresses in the rate-limit table.
- Password signup must not pre-consume a Turnstile token before Supabase Auth receives it.
- Production authentication paths fail closed when verification or the shared limiter cannot decide.
- Preserve signup consent, redirect, retry, and existing-account behavior.

---

### Task 1: Bind Turnstile to Supabase Auth Signup

**Files:**
- Create: `frontend/lib/signup-auth-options.ts`
- Create: `frontend/lib/signup-auth-options.test.ts`
- Modify: `frontend/app/signup/signup-form.tsx`
- Modify: `frontend/lib/turnstile-verify-policy.test.ts`

**Interfaces:**
- Produces: `buildSignupAuthOptions(input): { emailRedirectTo: string; captchaToken?: string; data?: Record<string, string> }`
- Consumes: a validated redirect URL, optional Turnstile configuration/token, and optional consent version.

- [ ] **Step 1: Write the failing signup-options tests**

Add tests proving that configured signup requires a non-empty token, forwards it as `captchaToken`, preserves consent metadata, and omits `captchaToken` only when Turnstile is not configured.

```ts
assert.deepEqual(
  buildSignupAuthOptions({
    emailRedirectTo: "https://www.fanengagepro.com/auth/callback?next=%2Fonboarding",
    turnstileConfigured: true,
    turnstileToken: "verified-token",
    consentVersion: "2026-08-01.v1",
    acceptedAt: "2026-09-05T00:00:00.000Z",
  }),
  {
    emailRedirectTo: "https://www.fanengagepro.com/auth/callback?next=%2Fonboarding",
    captchaToken: "verified-token",
    data: {
      consent_accepted_at: "2026-09-05T00:00:00.000Z",
      consent_version: "2026-08-01.v1",
    },
  },
);
assert.throws(
  () => buildSignupAuthOptions({
    emailRedirectTo: "https://www.fanengagepro.com/auth/callback",
    turnstileConfigured: true,
    turnstileToken: null,
  }),
  /Turnstile token is required/,
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/signup-auth-options.test.ts`

Expected: FAIL because `signup-auth-options.ts` does not exist.

- [ ] **Step 3: Implement the minimal options builder**

Create a pure helper that trims and requires the token only when configured, returns `captchaToken` without verifying it, and adds consent metadata only when a version is present.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/signup-auth-options.test.ts`

Expected: all signup-options tests pass.

- [ ] **Step 5: Route signup through the options builder**

Remove `verifyTurnstileToken` and `captchaVerifiedRef` from password signup. Keep the UI gate that requires a rendered token. Call `supabase.auth.signUp` with `options: buildSignupAuthOptions(...)`, then reset the challenge after the Auth request consumes the token.

- [ ] **Step 6: Update the Turnstile policy regression test**

Replace source-text assertions about browser fail-open with contract assertions that signup imports `buildSignupAuthOptions`, does not import `verifyTurnstileToken`, and passes the current token into the builder.

- [ ] **Step 7: Run authentication regressions**

Run: `npm test -- --test-name-pattern='Turnstile|signup|auth'`

Expected: all matching tests pass and no test reports a failure.

- [ ] **Step 8: Commit Task 1**

```bash
git add frontend/lib/signup-auth-options.ts frontend/lib/signup-auth-options.test.ts frontend/app/signup/signup-form.tsx frontend/lib/turnstile-verify-policy.test.ts
git commit -m "fix: bind Turnstile token to Supabase signup"
```

### Task 2: Add Atomic Shared Authentication Limits

**Files:**
- Create: `supabase/migrations/0057_shared_auth_rate_limits.sql`
- Create: `frontend/lib/shared-rate-limit.ts`
- Create: `frontend/lib/shared-rate-limit.test.ts`
- Modify: `frontend/lib/rls-audit.test.ts`

**Interfaces:**
- Produces SQL RPC: `public.consume_rate_limit(p_scope text, p_identifier_hash text, p_limit integer, p_window_seconds integer) returns table(allowed boolean, remaining integer, reset_at timestamptz)`, revoked from every API role except `service_role`.
- Produces TypeScript: `checkSharedRateLimit(input, consume?): Promise<SharedRateLimitDecision>`.
- The optional `consume` argument is a narrow test seam matching the RPC result; production defaults to the service-role Supabase call.

- [ ] **Step 1: Write failing pure adapter tests**

Cover deterministic SHA-256 hashing with a required server-side salt, scope isolation in the RPC arguments, allowed/exhausted result mapping, and fail-closed behavior when the RPC throws or returns malformed data.

```ts
const decision = await checkSharedRateLimit(
  { scope: "turnstile", identifier: "203.0.113.7", limit: 10, windowSeconds: 900, salt: "test-salt" },
  async (args) => {
    assert.equal(args.p_scope, "turnstile");
    assert.notEqual(args.p_identifier_hash, "203.0.113.7");
    return { allowed: true, remaining: 9, reset_at: "2026-09-05T00:15:00.000Z" };
  },
);
assert.equal(decision.allowed, true);
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/shared-rate-limit.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the minimal server-only adapter**

Use `createHash("sha256")` over `salt + "\0" + identifier`, validate positive integer limits/windows, call the service-role-only public RPC via `createAdminClient().rpc(...)`, and return `{ allowed: false, reason: "backend_unavailable" }` for production-call errors.

- [ ] **Step 4: Run the adapter test and verify GREEN**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/shared-rate-limit.test.ts`

Expected: all adapter tests pass.

- [ ] **Step 5: Write the idempotent SQL migration**

Create schema `private`, a table keyed by `(scope, identifier_hash, window_start)`, RLS enabled with no client policies, and an atomic function that inserts or increments inside a fixed window. Revoke all schema/table/function access from `public`, `anon`, and `authenticated`; grant only the required schema usage and function execution to `service_role`. Set an explicit `search_path` and schema-qualify every relation.

- [ ] **Step 6: Extend SQL contract tests**

Assert that raw identifiers are not a column, the counter uses `INSERT ... ON CONFLICT ... DO UPDATE`, `service_role` is the only API role granted execution, and the function has an explicit empty or private-only `search_path`.

- [ ] **Step 7: Run shared-limiter and RLS tests**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/shared-rate-limit.test.ts lib/rls-audit.test.ts`

Expected: all tests pass.

- [ ] **Step 8: Commit Task 2**

```bash
git add supabase/migrations/0057_shared_auth_rate_limits.sql frontend/lib/shared-rate-limit.ts frontend/lib/shared-rate-limit.test.ts frontend/lib/rls-audit.test.ts
git commit -m "feat: add shared authentication rate limiter"
```

### Task 3: Enforce Shared Limits on Authentication Endpoints

**Files:**
- Modify: `frontend/app/api/turnstile/verify/route.ts`
- Modify: `frontend/app/api/auth/signup-error/route.ts`
- Create: `frontend/lib/auth-rate-limit-policy.ts`
- Create: `frontend/lib/auth-rate-limit-policy.test.ts`
- Modify: `frontend/.env.example`

**Interfaces:**
- Produces: `authRateLimitSalt(env): string` that rejects a missing salt in production and permits an explicit development-only salt outside production.
- Consumes: `checkSharedRateLimit` from Task 2.

- [ ] **Step 1: Write failing environment-policy tests**

Prove production rejects an absent `RATE_LIMIT_HASH_SALT`, preview/development accept only an explicit value or documented development fallback, and whitespace-only values are rejected.

- [ ] **Step 2: Run the policy test and verify RED**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/auth-rate-limit-policy.test.ts`

Expected: FAIL because the policy helper does not exist.

- [ ] **Step 3: Implement the policy helper**

Return the trimmed configured salt. Throw `RATE_LIMIT_HASH_SALT is required in production` for production absence and return `fan-engage-local-rate-limit` only outside production.

- [ ] **Step 4: Run the policy test and verify GREEN**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/auth-rate-limit-policy.test.ts`

Expected: all policy tests pass.

- [ ] **Step 5: Replace process-local checks in both routes**

Use scopes `turnstile-verify` and `signup-error`, limit 10, and window 900 seconds. Return HTTP 429 when exhausted and HTTP 503 with a generic body when the limiter backend is unavailable. Do not log raw identifiers or the salt.

- [ ] **Step 6: Document the new environment variable**

Add `RATE_LIMIT_HASH_SALT` to `.env.example` with instructions to use a long random production value and never expose it with a `NEXT_PUBLIC_` prefix.

- [ ] **Step 7: Run Phase 1 focused verification**

Run: `npm test -- --test-name-pattern='Turnstile|signup|rate limit|RLS audit'`

Expected: all matching tests pass.

Run: `npm run test:types`

Expected: exit code 0.

- [ ] **Step 8: Commit Task 3**

```bash
git add frontend/app/api/turnstile/verify/route.ts frontend/app/api/auth/signup-error/route.ts frontend/lib/auth-rate-limit-policy.ts frontend/lib/auth-rate-limit-policy.test.ts frontend/.env.example
git commit -m "fix: enforce shared limits on auth endpoints"
```

### Task 4: Phase 1 Verification and Adversarial Review

**Files:**
- Review only: all Phase 1 changes.

**Interfaces:**
- Consumes the final candidate diff and produces verification evidence; no new interface.

- [ ] **Step 1: Inspect the complete Phase 1 diff**

Run: `git diff origin/main...HEAD --check && git diff --stat origin/main...HEAD`

Expected: no whitespace errors; only spec, authentication, limiter, migration, test, and environment-example files changed.

- [ ] **Step 2: Run the full frontend verification suite**

Run: `npm test`

Run: `npm run test:types`

Run: `npm run lint`

Run: `npm run build`

Expected: each command exits 0.

- [ ] **Step 3: Perform one read-only bypass review**

Trace every `supabase.auth.signUp` caller and every import of the shared limiter. Confirm no password-signup path omits `captchaToken` when configured, no route retains `authRateLimiter`, and ordinary development signup remains possible when Turnstile is explicitly unconfigured.

- [ ] **Step 4: Record deployment prerequisites**

Document that production requires: Supabase Auth Turnstile enabled with the matching secret, migration `0057` applied, and `RATE_LIMIT_HASH_SALT` set before deploying route changes.

- [ ] **Step 5: Commit any verification-only documentation corrections**

If no correction is required, make no commit. If prerequisite wording is corrected, commit only that documentation with `docs: clarify auth hardening rollout`.
