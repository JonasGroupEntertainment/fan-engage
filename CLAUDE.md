# Fan Engage Pro — agent entry point

This file loads automatically. It is deliberately thin: **corrections and commands only.**
The real context lives in the docs listed below — read them, don't re-derive them.
Last reconciled against the repo: **2026-10-29** (Sprint 3 of the 2026-10-29 audit).

## Read in this order

1. `docs/CONTEXT_HANDOFF.md` — what the product is, routes, domain modules, feature inventory (written for exactly this purpose; body dated 2026-06-15, header note dated 2026-10-29)
2. `LAUNCH_CHECKLIST.md` — **source of truth** for migrations applied, env vars, ship blockers
3. `COLLABORATING.md` — §4 bundle workflow, §9 gotchas, §10 agent rules
4. `docs/AI_INFRASTRUCTURE.md` — AI feature roadmap
5. `git log --oneline -30` — what actually landed recently

## Corrections — the docs above are stale on these points

Docs 1 and 3 carry dated "Updated 2026-10-29" notes at the top but their bodies were written
2026-06-15 / 2026-05-06. Where they disagree with this table, this table wins.

| Doc says | Reality (29 Oct 2026) |
|---|---|
| Repo is `KevinJonasSr/Superfan-platform` | **`JonasGroupEntertainment/fan-engage`** — renamed 26 Jul 2026. Old URL still redirects, so a wrong remote fails silently. |
| Work in `~/fan-engage` | **`~/Documents/GitHub/fan-engage`**. `~/fan-engage` still exists but is an **empty directory** — working there produces nothing and looks like success. |
| Live URL `fan-engage-pearl.vercel.app`, custom domain TBD | **fanengagepro.com** is live. |
| 36 migrations through 0036 | **Applied through `0088_follow_join_sync.sql`** (0085–0088 applied 2026-10-29). **0089–0092 are pending** from Sprint 3 — see the LAUNCH_CHECKLIST table for each one's status before assuming. 0092 is the out-of-band backfill (7 tables + 4 RPCs that prod had with no migration). |
| Migrations go in `frontend/supabase/migrations/` (COLLABORATING §5, §10) | **Canonical is root `supabase/migrations/`** (numbered `00NN_*.sql` plus timestamped `2026*_*.sql` files). `frontend/supabase/migrations/` holds 5 stale duplicates (0034–0038) — do not add there. |
| Run `npm run typecheck` (COLLABORATING §4, §10) | **No such script.** See Commands below — `npm test` and `npm run test:types` exist now. |
| `middleware.ts` | **`frontend/proxy.ts`** (Next 16 `proxy` convention). There is no `middleware.ts`; the `middleware`→`proxy` build deprecation is gone. |
| Default community hard-coded | **`frontend/lib/community-default.ts`** is the single source of truth, read from `NEXT_PUBLIC_DEFAULT_COMMUNITY_SLUG` (fallback `DEFAULT_COMMUNITY_SLUG`). Don't scatter slug literals. |
| Artist portal auth ad hoc | **`frontend/lib/artist-portal/roles.ts`** defines the portal roles (Sprint 1, #135). Gate new portal screens through it. |
| Follow and Join are separate | **Follow = Join is live (0088):** AFTER INSERT triggers mirror `fan_artist_following` ⇄ `fan_community_memberships`, backfilled 2026-10-29 (RaeLynn 26 → 1,551 followers). Deletes are *not* mirrored. |
| Artist payouts / ownership claims | Sprint 1 renamed the payouts page to **Revenue** and removed the fake Stripe sparkline and ownership claims (`app/artist-portal/payouts/page.tsx`). |
| Env vars | New since the docs: `CHECKIN_TOKEN_SECRET`, `CHECKIN_TOKEN_ROTATION`, `NEXT_PUBLIC_DEFAULT_COMMUNITY_SLUG`, `AI_DRAFTER_FREE_COMMUNITIES`. **LAUNCH_CHECKLIST has the rows** (what each does, set/unset state) — read them there, don't duplicate. |

What landed since the last reconciliation (all merged to `main`):
`#135` Sprint 1 (free earn loop, portal roles, visible bugs, no-demotion tiers · 0085),
`#136` Sprint 2 (Follow=Join · 0088, badge copy · 0086, network interim hardening · 0087),
`#137` portal recent-posts FK fix, `#138` LAUNCH_CHECKLIST bookkeeping.
Sprint 3 (this branch: `sprint3/fep-audit-fixes`) adds 0089–0092, `docs/PR4_ASSESSMENT.md`, and this reconciliation.

## Commands

```bash
cd ~/Documents/GitHub/fan-engage/frontend
npm run dev                # local
npm run build              # production build; also type-checks the app
npx tsc --noEmit           # app types only
npm run lint               # eslint
npm test                   # node --test over lib/**/*.test.ts (migration-shape + pure-logic tests)
npm run test:types         # tsc --noEmit -p tsconfig.test.json (types for the *.test.ts files)
node --test --experimental-strip-types --experimental-default-type=module lib/data/<one>.test.ts   # a single test file
```

`package.json` scripts are exactly: `dev`, `build`, `start`, `lint`, `test`, `test:types`. Nothing else.

Build currently succeeds with one known non-fatal noise: `getCurrentFan: failed … DYNAMIC_SERVER_USAGE`
on `/referrals` and `/rewards`. Those two routes call `cookies()` during prerender and something
swallows the error — so a *real* `getCurrentFan` failure would look identical in logs.
`export const dynamic = 'force-dynamic'` on both would silence it properly. Still not done.

## Hard rules (from COLLABORATING §9 — do not relearn these the hard way)

- **Stop at `git commit`. Never push.** Kevin pushes.
- `artists.slug` is the PK on FE — there is no `id` column.
- `fans.id == auth.uid()`. Same value, always.
- Community slug `nellies` belongs to **Brand Engage Pro**. Never activate it on FE.
- Supabase SQL editor silently drops statements in multi-statement scripts. One statement at a time.
- New secrets: `openssl rand -hex 32`. Base64 (`+`, `/`) gets mangled in copy-paste.
- Smoke-test crons with `?testEmail=` before any real run.
- Don't blind-copy bundle Python anchors between FE and BEP — the files diverge subtly.
- Migrations must be idempotent (`if not exists` / `or replace` / `drop policy if exists`) and must never
  `drop table`. Add a `lib/data/<name>.test.ts` that asserts the migration's shape (see
  `lib/data/follow-join-sync.test.ts`, `lib/data/out-of-band-objects.test.ts`).

## Repo state

`main` @ `23ef92c` (#138). Open branches worth knowing:

- `sprint3/fep-audit-fixes` — this sprint (0089–0092 + docs). Not yet a PR.
- **[PR #4](https://github.com/JonasGroupEntertainment/fan-engage/pull/4)** (`superfan-radar-wip`) is **closed,
  not merged, and the branch is deleted on origin** (only `refs/pull/4/head` remains). Everything in it
  already landed on main in a newer form (`app/admin/super-fans`, 0047 renumbered to 0060, Sprint 1 Revenue
  page); it no longer merges cleanly. **Leave it closed** — see `docs/PR4_ASSESSMENT.md` (2026-10-29).
- `sprint1/fep-audit-fixes`, `sprint2/fep-audit-fixes`, `chore/checklist-0088-applied`,
  `fix/portal-recent-posts-embed` — merged via #135–#138; safe to delete.
- `feat/stripe-connect-foundation`, `fix/raelynn-merch-shopify`, `security/next-16.4.1`, and ~20
  `cursor/*` branches — pre-existing, status unverified. (`integration`, `jgf-2368-blakerichardson-redirect`,
  `security/secret-scanning` no longer exist on origin.)

Dependabot alerts and automated security fixes are **on**. Production CVEs cleared 26 Jul via
`overrides` in `frontend/package.json`: `sharp` ^0.35.0 (libvips) and `postcss` ^8.5.23 (Next
vendors a pinned 8.4.31). **Don't remove those overrides** — both were transitive and can't be
bumped directly. Remaining `brace-expansion` alert is dev-only (eslint chain) and ships nothing.

`.scratch/` is git-ignored. It holds working notes such as `.scratch/out-of-band-ddl.md` (the live
DDL pull behind 0092); nothing there is distributed with the repo.

## Commit hook conflict — read before debugging a blocked commit

A global hook is active: `git config --global core.hooksPath ~/.githooks`, running a
credential-shaped-string scan on every commit in every repo. Bypass one line with `# secret-ok`,
a whole commit with `git commit --no-verify`.

This repo also has `.pre-commit-config.yaml` (gitleaks + `.gitleaks.toml` allowlist), but
`.git/hooks/pre-commit` is **not installed** here — and the global `core.hooksPath` would take
precedence over it even if you ran `pre-commit install`. To use this repo's gitleaks config
instead, set a repo-local override: `git config --local core.hooksPath .git/hooks`.

Also: a stale `.git/index.lock` will make `git add` and `git commit` fail while `git push`
appears to succeed — producing a pushed branch with none of your work in it. If a commit
silently does nothing, check for that file first.

## Sister product

Brand Engage Pro — `KevinJonasSr/brand-engage-pro`, `~/Documents/GitHub/brand-engage-pro`. Same
architecture, non-music brands. Features ship FE-first, then port via a mirror bundle. Schema
divergences are catalogued in `COLLABORATING.md` §7 — **audit column names before porting.**
(0085 and 0088 on FE are themselves ports of BEP 0082 / 0081, so the two repos are not strictly
FE-first any more — check both migration folders before numbering a port.)

Two BEP PRs open and unreviewed as of the last check (26 Jul; not re-verified from this repo):
[#3](https://github.com/KevinJonasSr/brand-engage-pro/pull/3) (Superfan Radar port, `/join`) and
[#4](https://github.com/KevinJonasSr/brand-engage-pro/pull/4) (six staged feature bundles, 4,172
lines, each with its own `apply.sh`, nothing wired in).

## Wider portfolio

`JonasGroupEntertainment` also owns `song-intelligence` and `jg-advisors`; the other 24 repos sit
under `KevinJonasSr`. **Anything that enumerates one owner misses the other** — that's how a
414-commit production repo went unnoticed during a full clone sweep. Full map:
`~/Obsidian/Obsidian Vault/40 References/Repo & Deployment Inventory.md`.
