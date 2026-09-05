# Fan Engage Pro Launch Hardening Design

## Goal

Make Fan Engage Pro safe to operate during its RaeLynn soft launch by binding bot verification to account creation, enforcing shared rate limits across serverless instances, requiring production-grade merge checks, and converting the outstanding database warnings into an explicit remediation decision.

## Scope

This work has three independently reviewable phases:

1. Authentication hardening.
2. Delivery safeguards.
3. Database launch readiness.

The implementation will not change production database state, Vercel settings, Supabase settings, Stripe configuration, or GitHub branch rules without a separate live-action checkpoint.

## Phase 1: Authentication Hardening

### Turnstile invariant

A successful Turnstile challenge must be consumed by the same Supabase Auth request that creates the user. Browser-only verification is insufficient because a caller can bypass the Fan Engage UI and call Supabase Auth directly.

The signup form will pass the unconsumed Turnstile token as `options.captchaToken` to `supabase.auth.signUp`. It will no longer pre-consume that token through `/api/turnstile/verify` during password signup. Existing retry, loading, consent, and user-facing error behavior will remain. Magic-link and password-recovery flows are outside this narrow change unless source tracing proves they share the same bypass.

Production enforcement depends on enabling the matching Turnstile provider and secret in Supabase Auth. Code verification will prove that the token reaches the Auth SDK; the production checkpoint will verify the dashboard configuration before traffic.

### Shared rate-limit invariant

Security-sensitive API limits must be shared across Vercel instances. The current process-local `Map` resets on cold starts and differs between instances, so it cannot provide that guarantee.

A migration will add a private rate-limit table and a single atomic `public.consume_rate_limit` database function. The function remains in the exposed API schema because Supabase does not expose private-schema RPCs by default, but all access is revoked except `service_role`; its table and state remain private. Server routes will use a small server-only adapter that calls the function with a hashed identifier, scope, request limit, and fixed window. Raw IP addresses will not be stored. Authentication endpoints will fail closed if the shared limiter cannot make a decision; non-security-sensitive endpoints may retain their existing availability behavior until migrated deliberately.

The first migration targets Turnstile verification and signup-error telemetry because they currently claim an authentication limit. Additional route migration will be listed explicitly rather than silently changing every API contract.

## Phase 2: Delivery Safeguards

The existing frontend workflow will require, in one GitHub Actions job:

- dependency installation with `npm ci`;
- test TypeScript checking;
- unit tests;
- ESLint;
- a production Next.js build.

The build will receive only documented non-secret placeholder values when compilation requires environment variables. It must not contact production services.

After the workflow is green, the proposed GitHub rule for `main` will require pull requests, successful frontend and secret-scan checks, dismissal of stale approvals, and blocking force pushes/deletion. Applying that rule is an external settings change and requires a live-action checkpoint.

## Phase 3: Database Launch Readiness

Migrations `0050` through `0056` will be reviewed in order against their callers and production invariants. The review will determine which are already represented in production migration history and which remain pending. No migration will be replayed based only on the checklist.

The 110 Supabase warnings will be grouped by issue type and risk. Mutable `search_path` warnings on `SECURITY DEFINER` or privileged functions are launch-priority; ordinary trigger helpers are lower priority but will be addressed with the same explicit schema-qualified pattern when safe. The output will be a minimal idempotent migration plus a list of warnings intentionally deferred with reasons.

Production application requires a preflight query, backup verification, and a separate approval checkpoint. Post-application verification will rerun Supabase's advisor and exercise signup, redemption, Stripe webhook idempotency, and founding-fan behavior through safe test paths.

## Testing Strategy

Every behavior change follows red-green-refactor:

- A signup-options test will fail unless the live Turnstile token is forwarded as `captchaToken` and is not pre-consumed.
- Shared-limiter tests will cover allowed, exhausted, isolated-scope, hashed-identifier, and backend-error behavior.
- Migration tests will exercise atomic window increments and privilege restrictions using the repository's existing SQL contract-test style.
- CI configuration will be validated by running the exact local commands before proposing the required check names.
- Existing authentication, onboarding, founding-fan, points-economy, and Stripe tests must remain green.

## Rollout and Failure Handling

Code and migrations will be delivered separately so dashboard configuration can be verified before enforcement. Turnstile-bound signup must not ship before Supabase Auth has the matching CAPTCHA secret configured, or legitimate signup could fail. The shared limiter migration must exist before routes switch to the database adapter.

If production configuration cannot be verified, the code remains reviewable but the launch status stays blocked. No fallback will silently weaken authentication in production.

## Success Criteria

- Direct signup without a valid Turnstile token is rejected by Supabase Auth, not merely by browser JavaScript.
- Authentication rate limits persist across application instances without storing raw IP addresses.
- Pull requests cannot merge unless tests, type checks, lint, build, and secret scanning pass.
- Migrations `0050–0056` have verified production status.
- Privileged mutable-`search_path` warnings are removed or explicitly blocked with source-backed reasons.
- A disposable-account smoke test completes signup, onboarding, logout/login, and the intended RaeLynn return path.
