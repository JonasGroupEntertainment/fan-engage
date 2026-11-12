# Fan Engage Pro — Context Handoff for Claude Code

> **Updated 2026-10-29.** Body below is from 2026-06-15. Corrections since: repo is `JonasGroupEntertainment/fan-engage` (renamed 26 Jul 2026; old URL redirects); live URL is **fanengagepro.com**; local checkout is `~/Documents/GitHub/fan-engage`; migrations are applied through `0088` (0089–0092 pending, see `LAUNCH_CHECKLIST.md`); `middleware.ts` is now `frontend/proxy.ts`; `npm test` / `npm run test:types` exist, `npm run typecheck` does not. `CLAUDE.md` at the repo root carries the full corrections table.

**Purpose.** Paste this file (or hand the path to Claude Code) at the start of a new session so the assistant gets a complete baseline before touching any code. Last updated 2026-06-15.

**Companion docs to read after this one:**
- `LAUNCH_CHECKLIST.md` (root) — single source of truth for migrations, env vars, and ship-blocking items
- `docs/AI_INFRASTRUCTURE.md` — the AI roadmap (20 features, 9+ shipped)
- `docs/LAUNCH_PLAN.md` — pre/post-launch task list with point persons
- `COLLABORATING.md` (root) — how Raymond and Kevin work in this repo
- `docs/ARTIST_AGREEMENT_RIGHTS.md` — legal-rights punch list

---

## 1. What Fan Engage Pro is

A multi-tenant fan engagement platform for recording artists. Members sign up for the platform, then join one or more artist communities. Per-community membership unlocks posts, events, rewards, leaderboards, and Premium ($-paid) perks. There is a sister product, **Brand Engage Pro (BEP)**, that runs the same code architecture for non-music brands (restaurants, retailers, hospitality). Most features ship FE-first then port to BEP via a "mirror bundle."

**Live URL.** `https://fanengagepro.com` (Vercel project `jonas-group/fan-engage`; `fan-engage-pearl.vercel.app` still resolves).
**Repo.** `JonasGroupEntertainment/fan-engage` (was `KevinJonasSr/Superfan-platform` until 26 Jul 2026; old URL redirects). Local checkout: `~/Documents/GitHub/fan-engage`.
**Supabase project ID.** Stored in `reference_fan_engage_urls.md` memory.
**Hosting.** Vercel (Jonas Group org). NOT Render — disregard any error that says "DATABASE_URL missing in Render."

**Active artist communities (FE):** RaeLynn, Danger Twins, Dan Marshall, Hunter Hawkins.
**Inactive slugs to leave alone:** `nellies` belongs to Brand Engage Pro — do not activate it in FE.

---

## 2. Tech stack

- **Frontend:** Next.js 16 App Router, TypeScript, Tailwind CSS, React server components + client components where state is needed
- **Backend:** Next.js server actions + route handlers (`app/api/*`)
- **DB:** Supabase Postgres with Row-Level Security; pgvector for embeddings (migration 0024)
- **Auth:** Supabase Auth (email/password + Google OAuth, Apple SSO deferred)
- **Storage:** Supabase Storage buckets — `community-uploads`, `avatars`, `community-videos`
- **Payments:** Stripe Checkout for Premium subscriptions, Stripe Connect on roadmap (G.6) for artist payouts
- **Email:** Mailchimp for transactional + digest blasts
- **SMS:** Twilio
- **Push:** Web Push API with VAPID keys (Stickiness Phase 2)
- **AI:** OpenAI (embeddings + GPT-4 family) — see `lib/embeddings`, `lib/moderation`, `lib/drafts`, `lib/captions`, etc.
- **Cron:** Vercel cron entries in `vercel.json`

---

## 3. Repository layout

```
/                       repo root
  LAUNCH_CHECKLIST.md   ship-blockers (auth as source of truth)
  COLLABORATING.md      workflow for Raymond + Kevin
  RATE_LIMITING.md      throttling policy
  /docs                 design docs (AI_INFRASTRUCTURE, LAUNCH_PLAN, FOCAL_POINT_FEATURE, ARTIST_AGREEMENT_RIGHTS, CONTEXT_HANDOFF)
  /supabase/migrations  0001 → 0036 (36 migrations)
  /frontend
    /app                Next.js App Router (see Section 4)
    /lib                domain modules (see Section 5)
    /components         shared UI (ImageUploader, FocalPointPicker, ShareButton, etc.)
```

---

## 4. Top-level routes (`frontend/app/*`)

**Public / member-facing:**
- `/` — Fan Home dashboard (upcoming events, recent activity, recap tile, mini leaderboard)
- `/artists` — directory with social-proof counts + genre filter
- `/artists/[slug]` — artist hub: hero, bio, socials, posts, events, leaderboard tile, rewards
- `/artists/[slug]/community` — feed with tag filter chips
- `/artists/[slug]/rewards` — rewards catalog with recommended-for-you hero
- `/artists/[slug]/leaderboard` — top fans with podium
- `/artists/[slug]/events/[id]` — event detail + RSVP
- `/rewards` — cross-community marketplace
- `/marketplace` — alias surface
- `/fans/[handle]` — public fan profile page (opengraph-image route)
- `/me` — personal hub (notifications, anniversaries, privacy, badges)
- `/me/privacy` — PII visibility toggles (email, phone, address)
- `/me/notifications` — push + email + SMS preferences
- `/me/anniversaries` — joined dates per community
- `/inbox` — notifications with archive
- `/search` — semantic search over posts/comments/events
- `/signup`, `/login`, `/onboarding` — auth flows with community pre-selection + referral capture
- `/apply` — artist application form (public)
- `/for-artists` — marketing page
- `/referrals` — invite-a-friend
- `/premium` — Premium upgrade landing
- `/share/founder/[slug]` — founding-fan share card
- `/legal`, `/terms`, `/privacy`, `/cookie-policy`, `/cancellation-refund` — legal pages

**Admin (gated by `ADMIN_EMAILS` env):**
- `/admin` — dashboard + community switcher (active-only)
- `/admin/artists` + `/admin/artists/[slug]` — brand-page editor (hero + focal point + accent + socials + genres)
- `/admin/artists/[slug]/setup` — onboarding wizard (G.5)
- `/admin/artists/[slug]/events/[id]/match` — AI event-match preview (Phase 8)
- `/admin/applications` — artist application queue with approve/reject + Slack
- `/admin/offers`, `/admin/rewards`, `/admin/redemptions` — commerce admin
- `/admin/community`, `/admin/communities` — moderation + content
- `/admin/moderation` — AI moderation queue (Phase 2)
- `/admin/briefs` — daily AI admin brief (Phase 15)
- `/admin/segments`, `/admin/analytics`, `/admin/founders`, `/admin/fans`
- `/admin/post-drafts` — nightly auto-draft generator (AI #18)
- `/admin/policies` — legal pages CMS
- `/admin/campaigns`, `/admin/challenges`, `/admin/influencers`, `/admin/fraud-signals`
- `/admin/stripe` — Stripe sync utilities

---

## 5. Domain modules (`frontend/lib/*`)

| Module | What it does |
|---|---|
| `embeddings/` | OpenAI embedding generation + pgvector helpers (AI Phase 1) |
| `moderation/` | Inline + cron content classifier with explainer reasons (AI Phase 2) |
| `drafts/` | AI-drafted comment replies (Phase 3) |
| `digest/` | Weekly Mailchimp digest gather + summarize + send (Phase 4) |
| `tagging/` | Auto-tag posts with GIN index + filter chips (Phase 5) |
| `search/` | Semantic search across posts/events/artists (Phase 6) |
| `event-matching/` | Score + match events to fans + notify (Phase 8) |
| `recs/` | Recommended rewards per fan (Phase 10) |
| `captions/` | AI image captions for uploaded photos (Phase 12) |
| `admin-brief/` | Daily admin brief + Slack delivery (Phase 15) |
| `dedup/` | De-dupe near-identical submissions (AI #20) |
| `reminders.ts` | Smart reminder timing (AI #19) |
| `post-drafts/` | Nightly auto-draft generator (AI #18) |
| `fraud-detection/` | Signup + redemption fraud scoring (AI #17) |
| `personal-feed/` | Personalized post feed (AI #7) |
| `alt-text/` | AI alt-text for accessibility |
| `streaks/` | Daily streak system (Stickiness Phase 1) |
| `notifications/` | Web push + SMS + email orchestration (Phase 2) |
| `personal-recap/` | Weekly recap tile on Fan Home (Phase 3) |
| `drops/` | Limited-time rewards with countdown + push triggers (Phase 4) |
| `leaderboard/` | Top members per community (Phase 5) |
| `predictions/` | Polls + predictions with resolve+award (Phase 6) |
| `anniversaries/` | Membership anniversary celebrations (Phase 7) |
| `applications/` | Application pipeline + Slack + email + approve/reject (G.2) |
| `onboarding/` | Initialize from application + setup wizard (G.5) |
| `onboarding-chat/` | Conversational onboarding helper |
| `socials/` | Forgiving social-link parser (bare URLs + auto-detect platform) |
| `influencers/` | Influencer + promo code tracking (migration 0036) |
| `entitlements.ts` | Premium gating + points multiplier |
| `stripe.ts` + `stripe-helpers.ts` | Stripe Checkout + webhook handling |
| `use-form-save.tsx` | Retry+probe hook used on every write surface (saves 503s under flaky Supabase) |
| `rate-limit.ts` | Edge-safe throttling |
| `data/` | Typed data fetchers (artists, fans, offers, rewards, events, fan-profile) |
| `supabase/` | Admin + browser + server client factories |

---

## 6. Database — 36 migrations through 0036

All applied to FE Supabase except where noted in `LAUNCH_CHECKLIST.md`.

**Core (0001–0023):** Fans, points, tiers, badges, referrals, offers, purchases; community posts + reactions + comments; polls + challenges; storage buckets + 13 starter badges; campaigns + moderation; DB-backed artists + events + per-artist following; event RSVPs + reminders; legal policy_pages + consent + unsub tokens; notifications + fan-out; multi-tenant communities + admin_users + Street Team auto-enrollment; activate Danger Twins / Dan Marshall / Hunter Hawkins; Stripe subscriptions + founder cap; founder slot race-safe assignment; Premium visibility + tier helpers; 1.5× points multiplier wireup; cascade badge insert; founder-only tier widening; cancellation policy; rewards_catalog + redeem_reward RPC; community videos; **0023 fix_award_badge_delegate** patches a 42P10 mismatch that was silently breaking every signup since 0011.

**AI (0024–0032, 0036):**
- 0024 content_embeddings + pgvector
- 0025 moderation columns + RLS
- 0026 draft_used flag
- 0027 digest_log + fans.digest_subscribed
- 0028 community_posts.tags + GIN index
- 0029 event_match_log + artist_events.match_processed_at
- 0030 recommend_rewards_for_fan RPC
- 0031 community_posts.caption_used
- 0032 admin_briefs
- 0036 influencers + promo_codes

**Stickiness + polish (0033–0035):**
- 0033 music_outlet (multiple social platforms per artist as JSONB)
- 0034 founder_fan_badge
- 0035 focal_point (per-artist hero focal_x/focal_y)

**Schema gotchas:**
- `fans.id = auth.uid()` — they are the same UUID. Don't add a separate fan_id.
- `fan_badges` join is keyed on (`fan_id`, `badge_id`); use `award_community_badge()` RPC, not raw insert.
- `artists.slug` is the PRIMARY KEY — there is no `artists.id` column. Anything referencing an artist uses `artist_slug`.
- BEP equivalents have rename divergences: `offers` → `rewards`, `brand_events.detail` (FE: `description`), `brand_events.event_date` (FE: `event_at`), `notify_*_my_post` is singular in BEP, `notification_preferences.fan_id` is `member_id` in BEP. See `project_bep_smoke_findings.md` memory before porting FE→BEP.

---

## 7. Feature inventory — what's shipped vs. pending

### AI roadmap (`docs/AI_INFRASTRUCTURE.md`) — 13 of 20 shipped

✅ Phase 1: Content embeddings + pgvector
✅ Phase 2: AI moderation + explainer chip
✅ Phase 3: AI-drafted comment replies
✅ Phase 4: Weekly Mailchimp digest
✅ Phase 5: AI post tagging + filter chips
✅ Phase 6: Semantic search
✅ Phase 8: Event-matching + notify
✅ Phase 10: Recommended rewards
✅ Phase 12: AI image captions
✅ Phase 15: Daily admin brief + Slack
✅ AI #5: TagSuggester on composer
✅ AI #7: Personalized feed v1
✅ AI #17: Fraud detection v1
✅ AI #18: Nightly auto-draft cron
✅ AI #19: Smart reminder timing
✅ AI #20: De-dupe submissions
✅ Alt-text Phase 1 + Phase 2 (render + backfill cron)
✅ Moderation explainer chip

❌ Phases 7, 9, 11, 13, 14, 16 — not yet scoped or deprioritized. See `AI_INFRASTRUCTURE.md` for the full roadmap and which ones are next in priority.

### Stickiness roadmap — 7 of 7 phases shipped (FE + BEP)

✅ Phase 1: Daily streak system
✅ Phase 2: Web push + SMS opt-in + service worker + VAPID
✅ Phase 3: Personal weekly recap tile
✅ Phase 4: Limited-time drops with countdown + push triggers
✅ Phase 5: Top members leaderboard with podium
✅ Phase 6: Predictions / polls with resolve+award
✅ Phase 7: Member-brand anniversary moments + cron

### Audit punch list (2026-05-05) — 33 of 38 done

The big audit shipped H-2 through H-7 + M-1 through M-18 + L-1 through L-9 fixes (signup redirect, search mojibake, INVALID DATE, marketplace seed/hide, notification preferences, latest-strip above the fold, anniversaries page, inbox archive, community pre-selection at signup, filter chips port FE→BEP, social-proof counts, dynamic titles, genre filter, notification grouping, referral capture banner, marketplace lock icon, SSO at signup, deep-link URLs, date-format unification, search latency fix).

Five items deferred — tracked in `project_audit_remaining.md` memory: M-1, M-2, M-3, M-11, M-16 (some are already done; reread that memory for current state).

### Lead-agent rollout — Tier 1 shipped 2026-05-06

Tier 1 (positioning + required fields) live. Tiers 2-5 pending.

### Launch readiness (per `LAUNCH_PLAN.md`)

Pre-launch and post-launch task lists exist with point persons in caps. Key remaining items:
- **G.4 — Custom domain** (fanengage.com or similar). George owns, Raymond + Kevin wire DNS + SSL.
- **G.5 — Onboarding wizard** at `/admin/<slug>/setup` (✅ shipped, still polishing)
- **G.6 — Stripe Connect** for artist payouts (pending)
- Asset gathering for all artists — Carla / Raymond / George (deadlines 5/12 for RaeLynn, 5/15 for others). Email scheduled.

---

## 8. Workflow conventions — read before any code change

**Bundle-based collaboration:**
1. I (Claude) edit files directly under `/Users/kevinjonassr/fan-engage` AND drop a tarball + `apply.sh` into the outputs folder as a backup.
2. Kevin commits + pushes from his terminal — the sandbox has a stale `.git/index.lock` and the deploy key has no write access.
3. Vercel auto-deploys on push to `main`.

**For migrations:**
1. Write the migration file to `/supabase/migrations/00NN_xxx.sql`
2. Apply via Supabase SQL editor (open via Chrome MCP — Claude can drive it)
3. Mark applied in `LAUNCH_CHECKLIST.md`
4. Commit the .sql file with the next code bundle

**Vercel Sensitive env vars:** `vercel env pull` returns empty for Sensitive vars; rotate to test, use hex-only secrets. See `feedback_vercel_sensitive_secrets.md` memory.

**Save retries:** Use the `useFormSave` hook on every write surface — it handles Supabase 503 retry + probe + status indicator.

**Schema parity:** FE feature ports to BEP need a column-name audit first. See `reference_bep_schema_map.md` memory.

---

## 9. Notable component patterns

- `<ImageUploader />` — wraps Supabase Storage upload, supports any bucket, returns public URL via `onUploaded` callback
- `<FocalPointPicker />` — click-to-set focal-x/focal-y on the artist hero (% values 0-100)
- `<ShareButton />` — Web Share API with copy-link fallback
- `<TagSuggester />` — AI-suggested tags chip row in composer
- `<CaptionSuggester />` — AI alt-text + caption on uploaded images
- `<CommentDrafter />` — AI-drafted reply with regenerate
- `<DropCountdown />` — drops_at / expires_at live countdown
- `<PredictionCard />` — vote + resolution badge
- `<WeeklyRecapTile />` — personalized fan recap on home

All admin forms use `<SaveStatusIndicator />` + `useFormSave()` from `lib/use-form-save.tsx`.

---

## 10. People and ownership

(See `reference_team_roster.md` memory for full roster.)

- **Kevin** — product + engineering, owns this session
- **Raymond Boyd** (`raymond@jonasgroup.com`, also `raymond@lyvcreative.com`) — engineering collaborator, super-admin granted, deploys + DNS work
- **Carla Moore** — operations + artist asset gathering, super-admin granted
- **George Kreis** (`george@jonasgroup.com`) — counsel + custom domain ownership
- **Leslie DiPiero** (`leslie.dipiero@jonasgroup.com`) — JG Publishing President (Dan Marshall conduit via Erin Mooring)
- **Lori Squires** (`loris@clarityconsultingsc.com`, Clarity Consulting SC) — RaeLynn point person

---

## 11. Open work — what's actively in flight or queued

**In progress (one task):**
- Task #312 — **Hotfix: onboarding email field readOnly trap.** Not finished. The `/onboarding` email field had a readOnly trap that blocks fans who arrive without a pre-filled value. Check `app/onboarding/*` and `lib/onboarding/*` for partially applied fix.

**Pending (from FE G-series):**
- **G.4** — Custom domain (owner: George; wiring: Raymond + Kevin)
- **G.6** — Stripe Connect for artist payouts

**Recent context (June activity):**
- Pre-commit hooks added (`.pre-commit-config.yaml`)
- Gitleaks config (`.gitleaks.toml`)
- GitHub Actions workflow added
- `RATE_LIMITING.md` policy doc
- Influencer + promo code migration (0036) shipped

**Things to NOT do without explicit ask:**
- Activate `nellies` — it belongs to Brand Engage Pro
- Reduce the Founding Fan badge bonus — team agreed it's a non-issue, NO change planned
- Add Apple SSO until the custom auth domain ships
- Mock the database in tests — integration tests must hit a real DB

---

## 12. How to use this in a Claude Code session

Paste the following at the start of the new session:

> "I'm picking up work on Fan Engage Pro. Read `docs/CONTEXT_HANDOFF.md` first, then `LAUNCH_CHECKLIST.md`, then `docs/AI_INFRASTRUCTURE.md`. The one in-progress task is the onboarding email readOnly hotfix — check there before anything new. Here's what I'd like to work on today: [your goal]."

Claude Code will then load the right files, follow the bundle-based workflow, and avoid the schema/workflow gotchas above.
