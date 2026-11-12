# Collaborating on Fan Engage + Brand Engage Pro

> **Updated 2026-10-29.** Body below is from 2026-05-06; only the statements that became false were corrected in place. Repo: `JonasGroupEntertainment/fan-engage` (not `KevinJonasSr/Superfan-platform`); local path `~/Documents/GitHub/fan-engage` (not `~/fan-engage`); migrations live in root `supabase/migrations/` (not `frontend/supabase/migrations/`); there is no `npm run typecheck` — use `npm run build`, `npx tsc --noEmit`, `npm test`, `npm run test:types`. See `CLAUDE.md` for the full corrections table.

Living guide for collaborators (humans and Claude agents). Last refreshed 2026-05-06 after the G.3 Mailchimp follow-through shipped.

---

## 1. The two products

| Product | Repo | Prod URL | Audience | Focus |
|---|---|---|---|---|
| **Fan Engage (FE)** | `git@github.com:JonasGroupEntertainment/fan-engage.git` | https://fanengagepro.com | Music + entertainment fans | Artists, performers, comedians, podcasts |
| **Brand Engage Pro (BEP)** | `git@github.com:KevinJonasSr/brand-engage-pro.git` | https://brand-engage-pro-jonas-group.vercel.app | B2C consumer member-club | Restaurant brands (Nellie's), Jonas Group brand entertainment |

> **Naming note:** the FE GitHub repo was `KevinJonasSr/Superfan-platform` until 26 Jul 2026 and is now `JonasGroupEntertainment/fan-engage` (old URL redirects). The Vercel project is `jonas-group/fan-engage`. The local folder Kevin uses is `~/Documents/GitHub/fan-engage` (`~/fan-engage` exists but is empty). All refer to the same codebase.

Both ship from the `main` branch through Vercel auto-deploy. Both run on Next.js 16 App Router, Supabase Postgres + Auth + Storage, Tailwind, shadcn/ui. BEP started as a fork of FE and went through a full `artist→brand` / `fan→member` rename; the schemas now diverge in many small ways (see §7).

---

## 2. Access matrix (refresh — assumes you're already onboarded)

If anything below is missing, ping Kevin (kevinjonassr@gmail.com).

- **GitHub** — write access to both repos (`JonasGroupEntertainment/fan-engage` for FE, `KevinJonasSr/brand-engage-pro` for BEP).
- **Vercel** — `jonas-group` team, Developer role on both `fan-engage` and `brand-engage-pro`.
- **Supabase** — KevinJonasSr's Org. Project IDs:
  - FE: `uhovonrljcauaoctypbg`
  - BEP: `enfpviapxvqyoarwwsuf`
- **Database admin** — `super_admin` role granted via `admin_users` table on both projects (so admin pages render). Your email also lives in `ADMIN_EMAILS` env var on both Vercel projects.
- **Mailchimp** — FE only, audience `554139`. DIGESTHTML and DIGESTTEXT merge fields are live; the weekly-digest cron pushes per-fan content into them.
- **Stripe** — read access on both Stripe accounts. Stripe Connect for FE artist payouts is the G.6 work, still pending.

---

## 3. Local setup

```bash
# Clone
git clone git@github.com:JonasGroupEntertainment/fan-engage.git ~/Documents/GitHub/fan-engage
git clone git@github.com:KevinJonasSr/brand-engage-pro.git ~/brand-engage-pro

# Per repo
cd ~/Documents/GitHub/fan-engage/frontend   # or ~/Documents/GitHub/brand-engage-pro/frontend
npm install
npx vercel link                   # pick jonas-group/<repo>
npx vercel env pull .env.local --environment=development
npm run dev
```

**Sensitive env var gotcha** (saved us 30 minutes during the G.3 smoke test): `vercel env pull` returns empty strings for variables flagged "Sensitive" in the Vercel dashboard. They live encrypted at rest and intentionally don't ship to your laptop. To use one locally, either rotate it (generate a new value, paste it into Vercel, save, redeploy, use the same value locally) or pull it from the dashboard manually. **Use `openssl rand -hex 32` for new secrets** — base64's `+` and `/` chars get mangled in copy-paste between terminal and Vercel form.

---

## 4. The bundle workflow (how every multi-file change ships)

Built around the constraint that the agent does not have direct write access to Kevin's working tree, plus the desire to keep `git push` a human decision.

1. **Agent writes a self-contained bundle** in its sandbox at `outputs/_<bundle_name>/`:
   - `apply.sh` — bash script that patches `~/<repo>` files in place
   - any auxiliary files referenced by `apply.sh` (e.g., a new component file copied verbatim)
2. **Kevin runs the bundle locally:**
   ```bash
   bash "/path/to/outputs/_<bundle_name>/apply.sh"
   ```
3. The bundle:
   - Edits files via Python `replace`/anchor matching (idempotent — anchors check both `old` and `new` so re-runs don't double-apply)
   - Runs `npm run build` (or `npx tsc --noEmit`) — there is no `typecheck` script
   - Stages and commits with a descriptive message
   - Prints `Push: git push` and stops
4. **Kevin pushes** (`git push`) when ready. Vercel auto-deploys.
5. **Smoke test the deploy.** A pattern we use a lot for crons:
   ```bash
   curl -sI https://<repo>.vercel.app/<route> | head -1   # is it up?
   ```

This pattern is tolerant of drift — apply.sh prints `! anchor not found` warnings rather than aborting if a single file diverged. The bundle keeps doing the rest of the work.

**Don't auto-push.** The bundle's job ends at "committed." Kevin pushes intentionally.

---

## 5. Database changes — Supabase SQL editor

Migrations live at root `supabase/migrations/00NN_*.sql` upward (`frontend/supabase/migrations/` holds stale duplicates — do not add there). To run a migration in production:

1. Open the Supabase SQL editor for the right project (FE or BEP).
2. Paste the migration SQL.
3. Click Run.

**Multi-statement gotcha:** Supabase's SQL editor sometimes only runs the LAST statement in a multi-statement script. We hit this hard during the founder-member badge backfill. **Workaround:** run `INSERT` statements alone. If you need to verify, use `RETURNING` in the same INSERT rather than a separate `SELECT`.

For more complex changes (data backfills, function updates), the agent can drive the editor via Chrome MCP — see §10.

---

## 6. Current state snapshot (as of 2026-05-06)

### Fan Engage
- **AI roadmap:** 9 of 20 features live (embeddings, moderation, AI-drafted comments, weekly digest, tagging, semantic search, event matching, reward recs, image captions, daily admin brief, alt-text Phase 1+2, moderation explainer, personalized feed, fraud detection, smart reminder timing, dedupe submissions, AI-suggested tags, nightly auto-draft generator).
- **Stickiness Phase 1–7:** all shipped (daily streaks, web push + SMS, weekly recap tile, drops/specials with countdown, leaderboard, predictions/polls, anniversaries).
- **Audit punch list:** 33 of 38 items shipped (all H/M items closed except a handful in M-1, M-2, M-3, M-11, M-16 — see `project_audit_remaining.md` if you have access).
- **Lead-agent 5-tier rollout:** all five tiers shipped (validation + email auth-prefill, public preview pages, founding-fan badge auto-award, hero rewrite + live proof tiles).
- **G-series:** G.1 ✅ artists Danger Twins / Dan Marshall / Hunter Hawkins activated. G.2 ✅ application approve/reject + Slack + invite. G.3 ✅ Mailchimp DIGESTHTML/DIGESTTEXT merge fields + smoke-safe `?testEmail=` mode + stranded-draft cleanup. **G.4 pending** (custom domain). **G.5 effectively shipped** (onboarding wizard at `/admin/<slug>/setup` is live, just hasn't been formally checked off). **G.6 pending** (Stripe Connect for artist payouts).

### Brand Engage Pro
- All FE AI features ported. Stickiness Phase 1–7 ported. Predictions UI, leaderboard, anniversaries — live.
- B2C consumer rebrand (Tier 4 + 4.5) shipped: 17 files swept of music-coded copy. Hero is `"Skip the line. Earn the perks. Become a regular."`
- Premium pillars, marketplace placeholders, signup pitch, notification preferences — all sound like a member-loyalty product, not a music platform.
- Jonas Group brand seed kept its music-y copy on purpose (it IS a music brand inside the platform).

### Active customers
- **Nellie's Experience** (BEP) — restaurant member-club, primary BEP design driver.
- **RaeLynn** (FE) — country artist, primary FE launch artist (18 tour dates loaded, leopard accent palette, Luke Bryan tour mention live).
- **Jonas Group** (BEP) — entertainment brand seeded.

---

## 7. Schema divergences FE → BEP

When porting an FE feature to BEP, expect renames. The big ones:

| FE | BEP |
|---|---|
| `artists` | `brands` |
| `artist_slug` (FK column) | `brand_slug` |
| `fans` | `members` |
| `fan_id` | `member_id` |
| `fan_badges` | `member_badges` |
| `artist_events` | `brand_events` |
| `artist_events.event_date` (timestamptz) | `brand_events.event_date` (text — be careful) and `brand_events.event_starts_at` (timestamptz, added in F-2) |
| `artist_events.description` | `brand_events.detail` |
| `notify_comments_my_post` (plural columns) | `notify_comment_my_post` (singular — bit me twice) |
| `notification_preferences.fan_id` | `notification_preferences.member_id` |
| `rewards` table | `offers` table |

**FE-only quirks worth knowing:**
- `artists.slug` is the **primary key** (no `id` column). All dependents reference via `artist_slug`. Don't write `delete from artists where id = ...` — you'll get a 42703.
- `fans.id == auth.uid()`. The fan's primary key IS the Supabase auth user id. RLS policies depend on this.
- The `nellies` community slug exists on FE but **belongs to BEP**. Do NOT flip it active on FE.
- `community_posts.tags` is a `text[]` column with a GIN index (Phase 5).
- `last_digest_sent_at` is on `fans`. The weekly cron filters fans where it's NULL or older than 6 days.

**FE/BEP signup component divergence (gotcha that cost 4 hotfix commits):**
- FE: `frontend/components/signup/signup-form.tsx` exports `SignupForm` (named export).
- BEP: `frontend/app/signup/signup-client.tsx` exports `SignupPage` (default export).
- When porting signup-related changes, do NOT blind copy — adapt to each repo's component shape.

---

## 8. Key files and endpoints

### Source of truth for what's pending
- `LAUNCH_CHECKLIST.md` (root of each repo) — every open item lives here. Check this BEFORE suggesting new work.
- `AI_LAUNCH_CHECKLIST.md` — AI roadmap status.

### Cron routes (FE)
| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/weekly-digest` | Sundays 09:00 UTC | Mailchimp DIGESTHTML push + campaign send |
| `/api/cron/event-match-prepare` | Daily | Pre-compute fan↔event match scores |
| `/api/cron/embeddings-backfill` | Daily | Backfill missing pgvector embeddings |
| `/api/cron/moderation-backfill` | Daily | Re-run moderation classifier on pending posts |
| `/api/cron/admin-brief` | Daily | Slack delivery of admin engagement brief |
| `/api/cron/anniversaries` | Daily | Member-brand anniversary notifications |
| `/api/cron/auto-draft` | Nightly | AI-generated draft posts for inactive artists |

All crons share the same auth pattern: `Authorization: Bearer $CRON_SECRET`.

### Smoke test pattern (added in G.3)
The weekly-digest cron now accepts `?testEmail=foo@bar.com` to filter recipients to a single fan. Use it instead of running the cron raw on Tuesday — without the filter you'd blast everyone whose `last_digest_sent_at` is >6 days old.

```bash
curl -X GET "https://fanengagepro.com/api/cron/weekly-digest?testEmail=YOUR@EMAIL" \
  -H "Authorization: Bearer $CRON_SECRET" -i
```

The response tells you `totalCandidates`, `prepared`, `preparedWithMailchimp`, `skipped`, `errors`, `campaignId`. Walk that summary back through the pipeline if anything looks off.

### Mailchimp wiring (FE)
- Audience: `554139`
- Merge fields: `DIGESTHTML` (rich HTML body), `DIGESTTEXT` (plaintext fallback). Both >1000 char limit.
- Sender: `lib/digest/send.ts`. The `prepareDigestForFan` function returns `{ status: "rendered" | "merge_fields_updated" | "skipped_no_payload" | "error" }`. The route only fires the campaign if at least one recipient hit `merge_fields_updated`.
- **Stranded-draft cleanup** (G.3 follow-through): `broadcast.ts` now deletes the draft Mailchimp campaign on content/send failure so we don't accumulate orphans.

---

## 9. Tribal knowledge / gotchas

1. **Vercel Sensitive env vars** don't pull. See §3 fix.
2. **Supabase SQL editor** can drop multi-statement scripts. See §5.
3. **FE `artists.slug` is the PK.** No id column.
4. **FE signup component vs BEP** — different exports. See §7.
5. **`nellies` community slug belongs to BEP.** Never activate on FE.
6. **fans.id == auth.uid().** Treat them as the same value.
7. **Don't auto-push.** The bundle workflow stops at commit. Kevin pushes.
8. **Don't blind-copy bundle Python anchors between repos.** FE/BEP files diverge subtly.
9. **Use `openssl rand -hex 32` for new secrets.** Base64 chars (`+`, `/`) get mangled in copy-paste.
10. **Smoke-test crons with `?testEmail=` mode** before production cutover. The G.3 fix exists for this exact reason.

---

## 10. For Claude agents working on this codebase

If you are an agent invoked by Raymond (or any collaborator) on this codebase:

### Before suggesting any change
- Read `LAUNCH_CHECKLIST.md` to see what's already pending.
- Read `AI_LAUNCH_CHECKLIST.md` for AI features.
- Skim recent `git log --oneline -30` to see what landed in the last week.

### Workflow
- Use the bundle pattern (§4). Write `apply.sh` files into your `outputs/` working directory; have your human run them.
- Edit via Python anchor-replace, not full-file rewrite, when patching existing files. Print "anchor not found" warnings rather than aborting.
- Run `npm run build` (or `npx tsc --noEmit` plus `npm test`) inside `apply.sh` so type breakage gets caught before commit. There is no `npm run typecheck`.
- Commit messages: descriptive subject + body explaining the motivation. We reference task IDs (G.3, F.1.B, M-14, etc.) where relevant.
- Stop at `git commit`. Do not push.

### Database changes
- Prefer migrations (root `supabase/migrations/00NN_<name>.sql`) over ad-hoc SQL editor edits — they survive future restores. Make them idempotent and add a `frontend/lib/data/<name>.test.ts` shape test (run with `npm test`).
- When you must run ad-hoc SQL via the Supabase editor (data backfills, one-off fixes), keep it single-statement or use `RETURNING` in the same statement. Multi-statement scripts can drop earlier statements silently.
- The agent can drive the SQL editor via Chrome MCP if browser tools are connected. Use Monaco's `setValue` API to inject SQL, then Cmd+Return to run.

### Verification
- Smoke test crons with `?testEmail=` mode (FE) — never run a real cron with full audience in non-Sunday windows.
- For UI changes, take a screenshot through Chrome MCP and view it before declaring done.
- For RPC/schema changes, run a `select … where …` against the affected row and confirm shape.

### Tribal-knowledge files (if you have access to your principal's memory)
- `project_fan_engage.md`, `project_fan_engage_dont_touch.md`
- `project_lead_agent_rollout.md` (locks decisions on positioning + required fields)
- `reference_bep_schema_map.md`
- `reference_fe_artists_pk.md`
- `reference_signup_component_shapes.md`
- `feedback_workflow_bundle.md`
- `feedback_vercel_sensitive_secrets.md`

If you don't have access, this document is a reasonable substitute.

---

## 11. Things still pending

- **G.4** Custom domain (fanengage.com or similar) — not started.
- **G.5** onboarding wizard polish — wizard is live at `/admin/<slug>/setup`; remaining work is content/QA.
- **G.6** Stripe Connect for artist payouts — not started.
- **Audit M-1, M-2, M-3, M-11, M-16** — partial; specific notes in `project_audit_remaining.md`.
- **AI features 11–20** beyond what's shipped — see `AI_LAUNCH_CHECKLIST.md`.

---

## 12. People

- **Kevin Jonas Sr.** (kevinjonassr@gmail.com) — owner, runs the bundles, pushes commits.
- **Raymond Boyd** (raymond@jonasgroup.com / raymond@lyvcreative.com) — collaborator, primary work on Mailchimp + cron pipelines, Texas-based.
- **Carla** — collaborator, super-admin grant + Vercel Developer role.

When you commit, use the email tied to your GitHub account. Raymond's last known commit was 2026-04-07 from `raymond@jonasgroup.com`.
