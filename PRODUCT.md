# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Responsive, installable PWA (`frontend/public/manifest.json` `display: standalone`, `sw.js`, VAPID web push, `appleWebApp.capable`). No native code exists — no Capacitor, Expo, or React Native; no `ios/` or `android/` directories. A native wrapper is a stated post-launch item (`docs/LAUNCH_PLAN.md` Phase C), not a commitment. Mobile web and PWA install both remain `web` for design purposes.

## Users

**1. Fan — the consumer, and the primary user.** Table `fans`; `fans.id == auth.uid()` (same UUID, RLS depends on it). Signs up for the platform, then joins one or more artist communities (`fan_community_memberships`). Job: stay close to artists they already follow, earn points for things they would do anyway, and spend them on access that cannot be bought. Surfaces: `/` (Fan Home), `/artists`, `/artists/[slug]` and its `community` / `rewards` / `leaderboard` / `founders` / events sub-pages, `/community`, `/marketplace`, `/premium`, `/referrals`, `/invite/[code]`, `/search`, `/inbox`, `/activity`, `/recap`, `/me` (+ `privacy`, `notifications`, `anniversaries`, `card`), `/fans/[slug]`, `/account/billing`, auth and onboarding.

**2. Artist and artist team — the tenant operator.** Gated by `admin_users` rows scoped to a `community_id`. Role enum, from `supabase/migrations/0011_multi_tenant.sql`: `owner` | `admin` | `editor` | `viewer`, with in-product semantics — owner has full control including the team page; admin is day-to-day everything except the team; editor can post and manage events and redemptions; viewer is read-only analytics and community. Job: publish to the people who already care, see who the real superfans are, fulfil what they redeem, without sounding like a marketing department. Surfaces: `/artist-portal` and its `copilot`, `events`, `community`, `redemptions`, `leaderboard`, `payouts`, `team` pages. Team members sign up on the fan site first and are then added by email.

**3. Super admin — Jonas Group platform staff.** An `admin_users` row with `community_id = '*'`; `isSuperAdmin` in `frontend/lib/admin.ts`. Active community persisted in the `fe_admin_community` cookie. A legacy `ADMIN_EMAILS` allowlist synthesises a `('*','owner')` grant to prevent lockout while seeding is in flight. Job: provision and launch communities, moderate, run the economy, and watch the network. Surfaces: all of `/admin/*`; `launch`, `network`, `community/seed`, and `stripe/*` are super-admin only.

**4. Prospective artist, manager, or label — pre-account applicant.** `/for-artists` → `/for-artists/apply`. The contact may be the artist, a manager, or someone on the team. Applications land in `applications` and are reviewed at `/admin/applications` with Slack notification and invite email.

**5. Influencer — a tracked entity, not a login.** `influencers` + `influencer_promo_codes`, managed at `/admin/influencers`, attributed by UTM (`utm_medium=influencer`).

## Product Purpose

A multi-tenant fan engagement platform for recording artists. Fans sign up for the platform, then join one or more artist communities; per-community membership unlocks posts, events, rewards, leaderboards, and paid Premium perks. Original build goals (`docs/01-mvp-build-spec.md`): fans join and engage, fans earn rewards, fans purchase offers, artists manage the experience.

Artist-facing framing (`frontend/app/for-artists/page.tsx`): help artists build direct fan relationships, reward real engagement, and turn fan activity into drops, RSVPs, referrals, and community moments — without losing the artist's voice.

Fan-facing framing (`frontend/components/signed-out-landing.tsx`): follow the artists you love, earn points for every fan move, unlock real drops, events, and access the casuals never see. Three-step model: follow → earn → unlock.

**Success, as the repo actually defines it — these are the live gates, not aspirations:**

- AI drafter must lift comment volume **+30%**; below +10% it gets fixed rather than extended (`LAUNCH_CHECKLIST.md` AI pause gate).
- Weekly digest must hit **>25% open**, **>5% CTR**, **+15% 7-day return vs non-recipients**, or the cron pauses.
- Moderation **override rate >25%** forces a `PROMPT_VERSION` bump. The override rate is the eval signal.
- Economy reachability (`0046_economy_rebalance.sql`): Silver ~2 weeks of showing up, Gold ~2 months, Platinum a full season; a 250-point starter reward so a new fan tastes redemption in week one, not month six.
- Live listening parties wait for **≥3 active artists each with ≥50 followers** — without that audience no live session feels alive.
- Voice posts wait for **>20 posts/week per active community**.

## Positioning

Confirmed mechanisms, in the order they are actually defensible:

**1. A cross-app fan identity graph (Jonas Network).** Shipped read-only at `/admin/network` (`frontend/lib/network/`). Resolves `(source_app, local_id) → network_id` across Jonas Group properties and produces a per-fan superfan score spanning multiple apps. Structurally not copyable without owning that portfolio.

**2. Roster access as supply.** Communities are provisioned by hand-written migration, not signup: RaeLynn, Danger Twins, Dan Marshall, Hunter Hawkins, Denise Jonas, Franklin Jonas & The Byzantines, with Bailee Madison staged inactive. Jonas Group Publishing is a pipeline. A competitor cannot truthfully claim this roster.

**3. Engagement-earned status, not spend.** Points accrue from posting, commenting, voting, entering challenges, RSVPing, and checking in — so tier is earned by being a real fan rather than by having money.

**4. One codebase, two verticals.** The same architecture runs Brand Engage Pro for non-music brands, validating the loyalty mechanics in music and hospitality simultaneously.

**5. AI depth.** 13–16 of a 20-feature roadmap shipped; three are named publicly — AI-drafted comment replies, event↔fan match with travel distance, and the weekly personalised digest.

**No competitive-positioning document exists in this repo.** There are zero references to Patreon, Discord, Laylo, or any named competitor. Future work must not invent a competitive claim.

## Operating Context

**Naming, as of this record.** The product is **Fan Engage Pro**, matching the legal entity Fan Engage Pro LLC. This is a decision, not a description of the code: shipped strings currently say "Fan Engage" (manifest, `layout.tsx` `applicationName` and title template, footer), the GitHub repo is `Superfan-platform`, and `docs/01-mvp-build-spec.md` says "Superfan Platform". Reconciling those to Fan Engage Pro is confirmed outstanding work, and it is on George's TOS punch list as a legal item.

**Lexicon.** Fan Engage Pro speaks **fan** and **artist**. Brand Engage Pro speaks **member** and **brand**. The current "member" drift in FE docs and UI — "Members sign up for the platform", the "founding-member campaign" against a `founding-fan` badge — is leakage from BEP's rename and should be corrected toward fan. The incomplete club→experience sweep left a broken hero string ("Turn casual fans into real fan experiences") and mixed "fan experience" / "clubs" / "hub" in adjacent paragraphs on `/for-artists`.

**Deploy.** GitHub `KevinJonasSr/Superfan-platform` → Vercel team `jonas-group`, project `fan-engage`, auto-deploy on push to `main`. Supabase project `uhovonrljcauaoctypbg`. Hosting is Vercel, not Render. Live at `https://fan-engage-pearl.vercel.app`.

**The bundle ritual — the defining workflow constraint.** An agent does not have write access to the working tree. It writes a self-contained `outputs/_<bundle>/apply.sh` that patches files via idempotent Python anchor-replace, runs `npm run typecheck`, stages, commits, prints `Push: git push`, and stops. Kevin pushes. **Do not auto-push.**

**Migrations are applied by hand** in the Supabase SQL editor from `supabase/migrations/00NN_*.sql`, then marked applied in `LAUNCH_CHECKLIST.md`. Known trap: the editor sometimes runs only the last statement in a multi-statement script, so `INSERT`s run alone and use `RETURNING` in the same statement. Agents may drive the editor via Chrome MCP (Monaco `setValue`, then Cmd+Return). A second divergent migration tree exists at `frontend/supabase/migrations/` with numbering colliding at 0034–0038.

**Cron.** 16 Vercel cron entries in `frontend/vercel.json`, all bearer-authenticated with `CRON_SECRET`. Safety ritual: `?testEmail=` on `weekly-digest` — never run a real full-audience cron outside its window.

**Integrations confirmed in code.** Supabase (Postgres, Auth, Storage, pgvector), Stripe (Checkout, webhooks, Connect Express), Mailchimp (audience `554139`, digest merge fields), Twilio (SMS + inbound STOP/HELP), Web Push/VAPID, Cloudflare Turnstile on auth, OpenAI (`text-embedding-3-small`, 1536-dim), Anthropic Claude (moderation, alt text, drafts, briefs), Slack (admin brief + application alerts), QR codes (invite, fan card, check-in), Jonas Network SDK. **No POS integration exists** — the nearest shipped analogue is QR self-check-in and stamp cards, both ported from BEP.

**Admin/ops processes.** The `/admin/launch` wizard is a four-step artist launch: initialise → assign owner → review hero, goals, rewards → flip `communities.active`. Applications promise a 48-hour response and live in two to four weeks. Moderation is audited weekly. Hero focal point is an admin-tunable field (`hero_focal_x/y`), replacing hardcoded focal maps.

**Operational scar tissue that shapes UI work.** Cold-start 503s on Server Action POSTs are silently swallowed by React, so the `useFormSave` retry-on-503 hook is mandated on every write surface, with `<SaveStatusIndicator/>`. Contract: actions must `return { success: true }` and must never `redirect()`, because the hook treats a redirect as a throw and retries. Vercel "Sensitive" env vars return empty from `vercel env pull`; generate secrets with `openssl rand -hex 32` because base64 `+`/`/` get mangled.

**Security.** gitleaks pre-commit hook plus a GitHub secret-scan action on every push. CSP, `X-Frame-Options: DENY`, HSTS with preload, and a restrictive `Permissions-Policy` are set in `next.config.ts`. Three admin gates: optional HTTP Basic, then Supabase session, then `admin_users`.

## Capabilities and Constraints

**V1 shape — confirmed decision.** Fan Engage Pro is **curated and hand-provisioned through V1**. Communities are created by migration and launched by a super admin; there is no self-serve artist onboarding. Self-serve onboarding at scale is a stated Phase 2 goal (`docs/LAUNCH_PLAN.md` Phase D), not a V1 capability. Multi-tenancy is real infrastructure — hostname-resolved communities, per-tenant accent theming, RLS — but it must not be presented as a shipped self-serve promise.

**Identity and onboarding.** Email/password, magic link, and Google OAuth — **OAuth buttons are currently commented out** pending the custom auth domain. Turnstile on signup, login, and forgot-password. Forgot/reset password shipped. Onboarding wizard with community pre-selection, referral capture, consent, and SMS + Mailchimp opt-in. Public fan profiles at `/fans/[slug]` with auto-generated `profile_slug`. Fan card with QR at `/me/card`.

**Points, tiers, badges.** `points_ledger` + denormalised totals. Awards: post +5, comment +2, poll vote +1, challenge entry +3, RSVP +10, check-in +25, anniversary +25, referral +150. Tiers bronze/silver/gold/platinum at 0 / 750 / 3,500 / 8,000. Thirteen starter badges plus Founding Fan; prestige badges are Premium-gated by `badges.tier`. Daily streaks with 7/30/100/365 milestones.

**Community.** Posts, announcements, polls, challenges, and predictions with reactions and threaded comments; `visibility` gating `public | premium | founder`; tags with GIN index and filter chips; video posts; pinning and moderation; cross-community feed; personalised feed; semantic search.

**Events.** `artist_events` with capacity, RSVP, `.ics` export, tier gating, per-event campaign audiences, automated 24h and 1h reminders, and AI event↔fan match scoring with an admin preview.

**Commerce.** `rewards_catalog` with a `redeem_reward()` RPC and a fulfil/refund queue; a separate global `offers` table behind `/marketplace`; limited-time drops with countdown and launch/expiry push; Stripe Premium subscriptions with race-safe founder-slot claiming, a public Founder Wall, share cards, and promo codes; Stripe Connect Express onboarding with an `artist_payouts` ledger.

**Growth.** Referral codes with QR, influencer promo codes with UTM attribution, leaderboards with podium and snapshots, share CTAs across events/RSVP/rewards/posts/tier/rank, and fraud detection on signups and redemptions.

**Messaging.** Weekly personalised Mailchimp digest, transactional email, Twilio SMS with STOP compliance, web push, in-app `/inbox`, per-channel preferences, computed optimal send hours, admin broadcast and campaigns.

**Schema hard rules — repeated as gotchas in three separate docs:**

- `artists.slug` is the **primary key**; there is no `artists.id`. Everything references `artist_slug`.
- `fans.id == auth.uid()`. RLS depends on it.
- `fan_badges` must be written via the `award_community_badge()` RPC, never a raw insert. The legacy `award_badge(uuid,text)` silently 500-ed every signup from migration 0011 until 0023 patched it; the patch hard-codes `community_id = 'raelynn'`, which the checklist itself calls architecturally wrong.
- `community_posts.tags` is NOT NULL — a null write once made fan posts vanish with the error swallowed.
- The `nellies` community slug exists here but **belongs to Brand Engage Pro — never activate it on FE.**
- Jonas Network tables have RLS enabled with **no policies**; every read must use the service-role client.
- `fans` has only a self-select policy, so feeds resolve author names through the security-definer RPC `get_fan_display_names(uuid[])`, which returns exactly id + first name.

**Technical ceilings.** Rate limiting is in-memory and per-instance — not distributed, lost on cold start, bypassable by a distributed attacker; that is an accepted trade-off with a documented upgrade path. **AI endpoints are not rate-limited yet** and that is a named pre-launch item. Uploads: the client resizes below 4MB and `/api/upload` caps at 8MB, but Vercel rejects bodies over 4.5MB before the function runs. Mailchimp text merge fields cap at 255 characters while digests render 800–3,500, so truncation is a live risk with three active communities. `content_embeddings` is `vector(1536)` pinned to `text-embedding-3-small`. Page titles currently double (`X · Fan Engage · Fan Engage`) from a layout template colliding with page-level strings.

**Terminology.** points · tiers (bronze, silver, gold, platinum) · badges (free vs premium) · founder, Founding Fan, founder_number, founder_cap, Founder Wall · Premium, comped, past_due · store credit · drops · streaks · predictions, polls, challenges · campaigns, segments, broadcast · offers vs rewards catalog vs redemptions · communities, memberships · Street Team · referrals · influencers, promo codes · check-ins, stamp cards · digest, admin brief · alt text, focal point · entitlements (`is_premium`, `points_multiplier` 1.5×, `is_founder`) · Jonas Network, network_id, superfan score · fan funnel, campaign goals, activity pulse, fan card.

**Explicitly undecided — all commercial terms.** No pricing or revenue term is ratified. What artists pay is reviewed per-artist at onboarding and needs a final number before Stripe Connect KYB. The `payout_split_pct` default of 20 in migration 0037 is a code default, **not a commercial decision**, and neither is `founder_cap = 100` or the `monthly_price_cents = 1000` / `annual_price_cents = 9900` schema defaults. The default cut on paid offers, payout cadence and threshold, chargeback and refund allocation, sales-tax responsibility, insurance, and liability caps are all to be drafted. **Future work must not state a price, a split, or a cap as fact.**

**Legal and rights constraints** (`docs/ARTIST_AGREEMENT_RIGHTS.md`): aggregate analytics belong to the artist while fan-level PII is gated by a per-fan toggle at `/me/privacy`; points-to-USD and tier thresholds are platform-owned and an artist does not unilaterally set cutoffs; in-platform AI processing is permitted but third-party LLM training requires explicit consent; synthetic audio, video, or imagery of an artist is prohibited and the artist may audit AI use of their content; artists own fulfilment of physical rewards and warrant IP-clean merch. The DMCA agent is registered (Brad Hamilton, Jones & Keller, P.C., Denver). Terms, Privacy, and Cookie Policy are in a holding state with `noindex` pending counsel. SMS 10DLC brand and campaign registration is not done. The COPPA position (draft 13+) is unconfirmed.

**Open legal question — fan data ownership.** The internal rights doc states the platform owns the fan database, that fans sign up for Fan Engage Pro rather than an individual artist, that an artist does not take the fan list on departure, that there is no bulk PII export without per-fan opt-in, and that artists may not contact fans off-platform absent explicit consent. The public `/for-artists` page is headlined "The fans you build here stay yours." **These cannot both be said to a manager in the same meeting, and neither is settled.** This goes to George / Jones & Keller before anything is written as fact. Until it resolves, **future work must not assert either claim** — not in marketing copy, not in artist-portal copy, not in onboarding.

## Brand Commitments

**Names.** Product: **Fan Engage Pro**. Legal entity: Fan Engage Pro LLC. Parent: Jonas Group. Counsel: Jones & Keller, P.C. (Denver). Financial: Clarity Consulting SC.

**There is no logo or wordmark.** `assets/` contains only `.gitkeep.txt`. `frontend/public/` holds create-next-app leftovers plus three byte-identical placeholder icons showing the letters "FE" in `system-ui` — a stand-in, not an identity. Missing and tracked: `icon-192.png` and a 72×72 monochrome `badge-72.png`, without which push notifications fall back to a generic bell. Favicon and OG image are open. Artist hero imagery lives in Supabase Storage, not the repo.

**Per-tenant identity is a product fact.** `communities`/`artists` carry `accent_from`/`accent_to` plus an admin-set hero focal point, so each artist community themes itself. Any platform-level visual decision has to survive arbitrary tenant accents.

**Voice, as evidenced by shipped strings:** "Free · 60 seconds · No credit card" · "No credit card. No spam." · "Join free and earn your first 100 fan points today." · "the stuff the casuals never see" · "More than a mailing list." · "Manager-grade questions, answered." · "No payment or contract required to apply. We respond within 48 hours."

**Two codified honesty commitments — treat these as binding brand rules:**

1. `frontend/app/page.tsx` — when KPIs are null, render zeros rather than fake marketing numbers, "so nothing ever lies."
2. `frontend/app/for-artists/page.tsx` — deliberately does not invent legal terms, pricing, or performance metrics; uses qualitative proof and "confirmed in onboarding" language until the Artist Agreement is final.

## Evidence on Hand

**Real and usable.** Live production at `https://fan-engage-pearl.vercel.app`. **RaeLynn** is the primary launch artist — 18 real tour dates, real hero photography, retuned accents, a full bio, tuned focal point. **Danger Twins**, **Dan Marshall**, and **Hunter Hawkins** are activated. **Denise Jonas** is active with a real 900-character bio and hero. **Franklin Jonas & The Byzantines** is active with a real bio naming the debut EP, singles, and the First of Many Tour, Fall 2026. **Bailee Madison** is staged inactive by design pending a signed agreement and hi-res assets. Real DMCA registration, a real team roster, a real external audit (2026-05-06, 33 of 38 items shipped), and real production incident write-ups.

**Does not exist — must not be fabricated.**

- **No testimonials or pull quotes.** `for-artists` carries an explicit TODO to replace marketing-written taglines with real quotes when they exist. The four artist taglines on that page are copy, not quotes.
- **No press coverage, case studies, ROI metrics, or B2B sales material.**
- **No traction number of any kind.** The landing proof tiles are live DB counts and may legitimately read zero. No number in this repo represents real traction.
- **No final legal copy.** ToS, Privacy, and Cookie Policy are placeholders under `noindex`.
- `frontend/lib/artists.ts` is a legacy hardcoded fallback roster containing stubs with "Placeholder bio — awaiting assets from Box drop." **These are not real artists.** The database is the source of truth.
- Missing artist content: Danger Twins bio and hero, several artists' tour dates, per-artist social links.
- Not wired: error tracking, uptime monitoring, admin audit log, AI cost alerts, Apple SSO, Google OAuth buttons, custom domain, app-store presence, per-artist Mailchimp segmentation, live streaming, DMs, multi-language.
- Not yet true: Stripe is in test mode; Stripe Connect has zero approved KYB; SMS 10DLC is unregistered; the Twilio inbound STOP webhook is unverified end to end.

**Documentation is stale relative to code.** The newest doc lags HEAD by roughly six weeks; `CONTEXT_HANDOFF.md` claims 36 migrations and 9 of 20 AI features while HEAD has 47 migrations through 0046 with the artist portal, Jonas Network, Turnstile, password reset, and the economy rebalance all shipped since. Read the code, not the docs.

## Product Principles

1. **Never let the interface lie.** Zeros over invented numbers; DB truth over fallback content; no price, split, cap, or metric asserted before it is ratified. This is already written into the code and it outranks persuasion.
2. **Status is earned by showing up, not by paying.** Points come from participation. Premium multiplies and unlocks, but it must never look like the only route to standing.
3. **Curated supply, real people.** Every community is provisioned deliberately for a named artist with real assets. Design for a small number of well-furnished tenants, not an empty self-serve long tail — and never present self-serve as shipped.
4. **The artist's voice survives the platform.** Per-tenant accents, hero focal points, and tone belong to the artist; platform chrome must recede rather than flatten them.
5. **Write for the fan who is already a fan.** The audience is not being convinced to care — they already do. Reward the move they were going to make anyway.
6. **Reliability is part of the design.** Cold-start 503s, the retry-on-save contract, hand-run migrations, and in-memory rate limits are facts of this system; any surface that writes must handle failure visibly.

## Accessibility & Inclusion

**No conformance standard is committed.** WCAG, Section 508, and ADA appear nowhere in the repo, there is no automated a11y check in CI, and the target level is **explicitly undecided** — it was raised in this interview and deliberately left open rather than invented here. Future work should not claim a conformance level.

**What is real and must be preserved:**

- **Base font size is 18px** on `html`, raised from 16px in two steps in direct response to fan feedback that text was too small. Because Tailwind's `text-*` utilities are rem-based, this scales all type and rem spacing. The in-file comment still says 17px — comment/code drift, the shipped value is 18px.
- **AI alt text is a shipped accessibility feature.** Claude vision generates a description on upload, the field is labelled "Describe the image for screen readers," and a nightly cron backfills any image without alt text.
- Voice-driven submissions are justified partly on accessibility for fans with motor or vision difficulties; deferred until there is enough content volume to serve.

**Known gaps, deferred post-launch and rated P1 by the external audit:** artist directory images need descriptive rather than decorative alt text; `aria-describedby` must wire helper and error text to inputs (**current count in the codebase is zero**); required fields need a visible plus screen-reader affordance; heading hierarchy needs a one-H1-per-page audit; decorative icons need `aria-hidden`; cookie banner and install prompt need correct focus order and keyboard dismissal. There is **no `prefers-reduced-motion` handling anywhere** despite heavy gradient, blur, and countdown animation. The UI is dark-only (`color-scheme: dark`) with substantial low-opacity text on near-black, and the contrast implications have never been analysed.

**Audience note.** The consumer audience may include minors; the COPPA position is drafted at 13+ but unconfirmed.
