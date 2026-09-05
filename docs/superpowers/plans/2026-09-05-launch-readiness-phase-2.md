# Launch Readiness Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining technical launch blockers and establish a repeatable protected delivery gate without changing legal copy.

**Architecture:** Keep the existing Next.js application structure and use ESLint itself as the regression test for the five purity/navigation violations. Extend the current single GitHub Actions job so its established check context remains stable, update only the lockfile-resolved vulnerable transitive packages, and apply repository protection only after the readiness change is merged.

**Tech Stack:** Next.js 16, React 19, TypeScript, ESLint 9, npm, GitHub Actions, Vercel, Supabase Auth, Cloudflare Turnstile, Stripe.

**Spec:** `docs/superpowers/specs/2026-09-05-launch-readiness-phase-2.md`

## Global Constraints

- Do not change legal policy copy.
- Do not create production accounts, subscriptions, charges, or other persistent customer records during smoke testing.
- Do not use force dependency upgrades.
- Preserve the existing `Unit tests + typecheck` GitHub check context.

---

### Task 1: Clear the frontend quality gate

**Files:**
- Modify: `frontend/app/me/card/page.tsx`
- Modify: `frontend/components/first-session-checklist.tsx`
- Modify: `frontend/components/latest-strip.tsx`
- Modify: `frontend/components/turnstile-widget.tsx`
- Modify: `frontend/components/welcome-quest.tsx`

**Interfaces:**
- Consumes: existing component props and local-storage keys.
- Produces: the same rendered UI and navigation with lint-compliant state synchronization and deterministic sorting inputs.

- [ ] **Step 1: Verify the regression gate fails**

Run: `cd frontend && npm run lint`
Expected: FAIL with five errors in the files listed above.

- [ ] **Step 2: Apply minimal lint-compliant implementations**

Use `next/link` for the internal home link; schedule browser-storage state updates from an effect callback rather than synchronously; derive Turnstile slow-copy visibility from load state; and capture the current time in the async data-collection snapshot before sorting.

- [ ] **Step 3: Verify the gate passes**

Run: `cd frontend && npm run lint`
Expected: PASS with warnings only and zero errors.

- [ ] **Step 4: Verify behavior contracts**

Run: `cd frontend && npm run test:types && npm test`
Expected: PASS.

### Task 2: Make lint and build mandatory in CI

**Files:**
- Modify: `.github/workflows/frontend-tests.yml`

**Interfaces:**
- Consumes: existing npm scripts and GitHub check context `Unit tests + typecheck`.
- Produces: one required check that installs, lints, typechecks, tests, and builds the frontend.

- [ ] **Step 1: Add lint and build steps**

Add `npm run lint` before typechecking and `npm run build` after tests. Supply safe public Supabase placeholders only to the build step.

- [ ] **Step 2: Run the full gate locally**

Run: `cd frontend && npm run lint && npm run test:types && npm test && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build`
Expected: PASS.

### Task 3: Resolve dependency advisories

**Files:**
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Consumes: the current direct dependency ranges in `frontend/package.json`.
- Produces: patched transitive versions selected by `npm audit fix` without `--force`.

- [ ] **Step 1: Capture the advisory baseline**

Run: `cd frontend && npm audit`
Expected: vulnerabilities in `@humanfs/node`, `browserslist`, `nanoid`, and `qs`.

- [ ] **Step 2: Update safe lockfile resolutions**

Run: `cd frontend && npm audit fix`
Expected: package lock changes only within compatible dependency ranges.

- [ ] **Step 3: Verify dependencies and application**

Run: `cd frontend && npm audit && npm run lint && npm run test:types && npm test && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build`
Expected: zero vulnerabilities and all application checks pass.

### Task 4: Deliver and protect main

**Files:**
- No application files beyond Tasks 1-3.

**Interfaces:**
- Consumes: GitHub pull-request checks and Vercel deployment status.
- Produces: merged readiness change and protected `main` branch.

- [ ] **Step 1: Commit, push, and open a pull request**

Commit the scoped changes, push `codex/launch-readiness-phase-2`, and open a pull request against `main`.

- [ ] **Step 2: Verify and merge**

Wait for `Unit tests + typecheck`, secret scanning, and Vercel checks to pass; then merge the pull request.

- [ ] **Step 3: Enable branch protection**

Require pull requests and the established successful status checks, require branches to be current, and do not require a separate approving reviewer.

### Task 5: Run non-destructive production smoke tests

**Files:**
- No repository changes.

**Interfaces:**
- Consumes: `https://www.fanengagepro.com` production routes and public auth/checkout entry points.
- Produces: an evidence-backed launch-readiness result without persistent customer-side effects.

- [ ] **Step 1: Verify public and guest routes**

Check the homepage, signup, login, premium page, health endpoint, and protected onboarding redirect behavior.

- [ ] **Step 2: Verify auth abuse boundary**

Confirm an invalid Turnstile token is rejected and password login remains reachable without creating an account.

- [ ] **Step 3: Verify Stripe entry point**

Confirm the premium checkout entry UI is present and does not error before submission; do not submit a purchase.

- [ ] **Step 4: Record deferred work**

Report that legal policy content and a full real-account/payment transaction remain owner-controlled launch steps.

