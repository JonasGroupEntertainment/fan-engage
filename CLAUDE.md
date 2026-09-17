# Fan Engage Pro — agent entry point

This file loads automatically. It is deliberately thin: **corrections and commands only.**
The real context lives in the docs listed below — read them, don't re-derive them.

## Read in this order

1. `docs/CONTEXT_HANDOFF.md` — what the product is, routes, domain modules, feature inventory (313 lines, written for exactly this purpose)
2. `LAUNCH_CHECKLIST.md` — **source of truth** for migrations applied, env vars, ship blockers
3. `COLLABORATING.md` — §4 bundle workflow, §9 gotchas, §10 agent rules
4. `docs/AI_INFRASTRUCTURE.md` — AI feature roadmap
5. `git log --oneline -30` — what actually landed recently

## Corrections — the docs above are stale on these points

Docs 1 and 3 were last updated 2026-06-15 and 2026-05-06. Since then:

| Doc says | Reality (26 Jul 2026) |
|---|---|
| Repo is `KevinJonasSr/Superfan-platform` | **`JonasGroupEntertainment/fan-engage`** — renamed 26 Jul. Old URL still redirects, so a wrong remote fails silently. |
| Work in `~/fan-engage` | **`~/Documents/GitHub/fan-engage`**. `~/fan-engage` still exists but is an **empty directory** — working there produces nothing and looks like success. |
| Live URL `fan-engage-pearl.vercel.app`, custom domain TBD | **fanengagepro.com** is live. |
| 36 migrations through 0036 | **46 applied through `0046_economy_rebalance.sql`**; `0047_flagged_table_rls.sql` exists only on branch `superfan-radar-wip`. |
| Migrations go in `frontend/supabase/migrations/` (COLLABORATING §10) | **Canonical is root `supabase/migrations/`** (47 files). `frontend/supabase/migrations/` holds 5 stale duplicates (0036–0038) — do not add there. |
| Run `npm run typecheck` (COLLABORATING §10) | **No such script.** Scripts are `dev`, `build`, `start`, `lint`. Use `npx tsc --noEmit`, or `npm run build` which runs TypeScript anyway. |

## Commands

```bash
cd ~/Documents/GitHub/fan-engage/frontend
npm run dev                # local
npm run build              # production build; also type-checks
npx tsc --noEmit           # types only
npm run lint               # eslint
```

Build currently succeeds with known non-fatal noise: `middleware`→`proxy` deprecation, and
`getCurrentFan: failed … DYNAMIC_SERVER_USAGE` on `/referrals` and `/rewards`. Those two routes
call `cookies()` during prerender and something swallows the error — so a *real* `getCurrentFan`
failure would look identical in logs. `export const dynamic = 'force-dynamic'` on both would
silence it properly. Not yet done.

## Hard rules (from COLLABORATING §9 — do not relearn these the hard way)

- **Stop at `git commit`. Never push.** Kevin pushes.
- `artists.slug` is the PK on FE — there is no `id` column.
- `fans.id == auth.uid()`. Same value, always.
- Community slug `nellies` belongs to **Brand Engage Pro**. Never activate it on FE.
- Supabase SQL editor silently drops statements in multi-statement scripts. One statement at a time.
- New secrets: `openssl rand -hex 32`. Base64 (`+`, `/`) gets mangled in copy-paste.
- Smoke-test crons with `?testEmail=` before any real run.
- Don't blind-copy bundle Python anchors between FE and BEP — the files diverge subtly.

## Repo state

`main` @ `7304c10`, clean. Branches on origin worth knowing:

- `superfan-radar-wip` → **[PR #4](https://github.com/JonasGroupEntertainment/fan-engage/pull/4)** — Superfan Radar admin + RLS 0047 + artist payouts. Recovered from an uncommitted working tree; **never reviewed, built, or tested.** Merged with main, no conflicts. Commits two marketing videos (14 MB) to git rather than LFS — decide before merging.
- `feat/stripe-connect-foundation`, `integration`, `jgf-2368-blakerichardson-redirect`, `security/secret-scanning` — pre-existing, status unverified.

Dependabot alerts and automated security fixes are **on**. Production CVEs cleared 26 Jul via
`overrides` in `frontend/package.json`: `sharp` ^0.35.0 (libvips) and `postcss` ^8.5.23 (Next
vendors a pinned 8.4.31). **Don't remove those overrides** — both were transitive and can't be
bumped directly. Remaining `brace-expansion` alert is dev-only (eslint chain) and ships nothing.

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

Two BEP PRs open and unreviewed: [#3](https://github.com/KevinJonasSr/brand-engage-pro/pull/3)
(Superfan Radar port, `/join`) and [#4](https://github.com/KevinJonasSr/brand-engage-pro/pull/4)
(six staged feature bundles, 4,172 lines, each with its own `apply.sh`, nothing wired in).

## Wider portfolio

`JonasGroupEntertainment` also owns `song-intelligence` and `jg-advisors`; the other 24 repos sit
under `KevinJonasSr`. **Anything that enumerates one owner misses the other** — that's how a
414-commit production repo went unnoticed during a full clone sweep. Full map:
`~/Obsidian/Obsidian Vault/40 References/Repo & Deployment Inventory.md`.
