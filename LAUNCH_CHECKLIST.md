# Fan Engage — Launch Checklist

Living document. Update this whenever a launch-blocking item is resolved or a new one is discovered. Grouped by category so blockers are easy to scan.

Last updated: April 26, 2026 — **Signup unblocked** (migration 0023 patches `award_badge` 42P10 — every fan signup since 0011 had been failing silently); Fan Home now surfaces the next 3 upcoming events from any followed artist (no RSVP required) + Recent Activity renders kind chip + body fallback so all post types display, not just titled ones; admin events list gained a per-row ✏️ Edit affordance with a full inline form; useFormSave hook earlier rolled out to most write surfaces; hero image crop fixed (object-position center 30%)

---

## 🗄️ Supabase migrations to apply

**Reconciled 2026-08-06.** This table was stale (only listed through 0023 + a stray 0034) — the repo actually has files through 0049, and Supabase had **32 additional migrations applied directly against the live database that were never checked into this repo** (timestamp-named files below, not the 00xx sequence). Those 32 have now been pulled down verbatim from `schema_migrations` and written into `supabase/migrations/` so the repo is once again a complete record of what's live. All 0001-0049 + all 32 backfilled files are `✅ applied` (confirmed against Supabase's actual migration history, not assumed).

⚠️ **Needs your eyes, not mine:** 18 of the backfilled migrations are `network_*` files (`network_backbone_v1`, `network_autonomy_spine_v1`, `network_agent_rpcs_v1`, `network_incron_autonomy_v1`, `network_command_layer_v1`, etc.), applied 2026-07-22 through 2026-07-31. That naming and shape (autonomy spine, agent RPCs, watchdog, trust ladder, command layer) reads like the **JG Advisors / Network autonomy layer**, not fan-facing Fan Engage schema — but they were applied to *this* project's database (`uhovonrljcauaoctypbg`), confirmed via direct query, not a different one. Worth confirming with whoever ran those whether that was intentional (shared infra) or a wrong-project mistake, since it's now permanently part of Fan Engage's schema history.

**Duplicate `0040` resolved:** both `0040_bailee_madison.sql` and `0040_secure_financial_and_leaderboard_tables.sql` existed with the same number. By commit date, `bailee_madison` came first (2026-06-17); `secure_financial_and_leaderboard_tables` (committed 2026-07-14) was renamed to `0049_secure_financial_and_leaderboard_tables.sql`. Contents untouched — this is a filename-only fix, currently staged but **not committed**.

| # | File | Adds | Status |
|---|---|---|---|
| 0001 | `0001_init.sql` | Fans, points, tiers, badges, referrals, offers, purchases | ✅ applied |
| 0002 | `0002_community.sql` | community_posts, reactions, comments | ✅ applied |
| 0003 | `0003_community_phase2.sql` | Polls, challenge entries | ✅ applied |
| 0004 | `0004_badges_and_storage.sql` | 13 starter badges, avatars, buckets, triggers | ✅ applied |
| 0005 | `0005_campaigns_and_moderation.sql` | Campaigns, CTAs, fan suspend | ✅ applied |
| 0006 | `0006_artists_and_following.sql` | DB-backed artists, events, per-artist following | ✅ applied |
| 0007 | `0007_events_rsvp.sql` | Event capacity, RSVPs, point trigger | ✅ applied |
| 0008 | `0008_event_reminders.sql` | event_reminders for cron de-dupe | ✅ applied |
| 0009 | `0009_legal_infrastructure.sql` | policy_pages, consent, unsub tokens | ✅ applied |
| 0010 | `0010_notifications.sql` | notifications table, award_badge fan-out, RSVP + referral triggers | ✅ applied |
| 0011 | `0011_multi_tenant.sql` | communities, fan_community_memberships, admin_users, community_id on every scoped table, Street Team auto-enrollment trigger | ✅ applied |
| 0012 | `0012_activate_artists.sql` | Activate Danger Twins / Dan Marshall / Hunter Hawkins communities + seed matching artists rows with brand accents | ✅ applied |
| 0013 | `0013_paid_subscriptions.sql` | Stripe subscription state on fan_community_memberships, stripe_customer_id on fans, 4 price_ids + founder_cap on communities, badges.tier column, stripe_events idempotency log, credit_grants audit trail, Founding Fan badge seed | ✅ applied |
| 0014 | `0014_founder_slot.sql` | claim_founder_slot() Postgres function — race-safe founder number assignment via per-community advisory lock | ✅ applied |
| 0015 | `0015_premium_gating.sql` | community_posts.visibility + artist_events.tier columns, is_premium() + points_multiplier() helper functions | ✅ applied |
| 0016 | `0016_points_multiplier_wireup.sql` | 4 community triggers × 1.5 multiplier for premium fans | ✅ applied |
| 0017 | `0017_points_multiplier_wireup_pt2.sql` | RSVP + fan-action triggers × 1.5 | ✅ applied |
| 0018 | `0018_award_community_badge.sql` | Cascade badge insert + points + notification | ✅ applied |
| 0019 | `0019_founder_only_tier.sql` | Widens visibility/tier checks + is_founder() helper | ✅ applied |
| 0020 | `0020_cancellation_refund_policy.sql` | Seed cancellation policy | ✅ applied |
| 0021 | `0021_rewards_redemption.sql` | rewards_catalog + reward_redemptions tables + redeem_reward() RPC + 4 seeded rewards | ✅ applied |
| 0022 | `0022_community_videos.sql` | video_url + video_poster_url columns + community-videos bucket | ✅ applied |
| 0023 | `0023_fix_award_badge_delegate.sql` | Patch award_badge(uuid, text) — delegates to award_community_badge to fix 42P10 ON CONFLICT mismatch that was rejecting every signup since 0011 | ✅ applied |
| 0024 | `0024_content_embeddings.sql` | Content embeddings for AI features | ✅ applied |
| 0025 | `0025_moderation.sql` | Moderation tooling | ✅ applied |
| 0026 | `0026_draft_used.sql` | Draft-used tracking | ✅ applied |
| 0027 | `0027_digest.sql` | Digest infrastructure | ✅ applied |
| 0028 | `0028_post_tags.sql` | Post tags | ✅ applied |
| 0029 | `0029_event_match.sql` | Event matching | ✅ applied |
| 0030 | `0030_reward_recs.sql` | Reward recommendations | ✅ applied |
| 0031 | `0031_caption_used.sql` | Caption-used tracking | ✅ applied |
| 0032 | `0032_admin_briefs.sql` | Admin briefs | ✅ applied |
| 0033 | `0033_music_outlet.sql` | Music outlet integration | ✅ applied |
| 0034 | `0034_founder_fan_badge.sql` | Founder fan badge (repo file renamed from earlier `0034_fan_profile_handle.sql` reference — verify handle work landed under a different number if needed) | ✅ applied |
| 0035 | `0035_focal_point.sql` | Image focal point | ✅ applied |
| 0036 | `0036_influencers_and_promo_codes.sql` | Influencers + promo codes | ✅ applied |
| 0037 | `0037_stripe_connect.sql` | Stripe Connect | ✅ applied |
| 0038 | `0038_artist_payouts.sql` | Artist payouts | ✅ applied |
| 0039 | `0039_leaderboard_snapshots.sql` | Leaderboard snapshots | ✅ applied |
| 0040 | `0040_bailee_madison.sql` | Bailee Madison artist setup | ✅ applied |
| 0041 | `0041_denise_jonas.sql` | Denise Jonas artist setup | ✅ applied |
| 0042 | `0042_franklin_jonas.sql` | Franklin Jonas artist setup | ✅ applied |
| 0043 | `0043_fan_display_names.sql` | Fan display names | ✅ applied |
| 0044 | `0044_super_admin_grants.sql` | Standing super-admin grants (Raymond direct; Hana/aiassistant pending signup at time of writing) | ✅ applied |
| 0045 | `0045_membership_points_sync.sql` | Fixes engagement-points-not-reaching-visible-balance defect (trigger award path for posts/comments/polls/challenges) | ✅ applied |
| 0046 | `0046_economy_rebalance.sql` | Points economy rebalance | ✅ applied |
| 0047 | `0047_rewards_terms_policy.sql` | Rewards terms policy | ✅ applied |
| 0048 | `0048_music_artist_rewards_expansion.sql` | Music/artist rewards expansion | ✅ applied |
| 0049 | `0049_secure_financial_and_leaderboard_tables.sql` | Secures financial + leaderboard tables (renamed from duplicate `0040`, see note above) | ✅ applied |
| 0050 | `0050_lock_redeem_and_membership_economy.sql` | A-P0-2/A-P0-3: bind `redeem_reward` to caller; lock fan/membership economy columns; unstick poisoned Stripe webhook rows | ⏳ apply on prod before paid traffic |
| — | `20260620195030_stamp_cards.sql` | Stamp cards | ✅ applied (backfilled) |
| — | `20260620195039_checkins.sql` | Check-ins | ✅ applied (backfilled) |
| — | `20260704054542_create_community_goals.sql` | Community goals | ✅ applied (backfilled) |
| — | `20260704055238_backfill_points_ledger_community.sql` | Points-ledger community backfill | ✅ applied (backfilled) |
| — | `20260704060113_create_copilot_briefs.sql` | Copilot briefs | ✅ applied (backfilled) |
| — | `20260713111819_enable_rls_payouts_and_leaderboard.sql` | RLS on payouts + leaderboard | ✅ applied (backfilled) |
| — | `20260722112323_snapshot_before_network_backbone.sql` | Pre-network-backbone snapshot | ✅ applied (backfilled) ⚠️ see network note above |
| — | `20260722112525_network_backbone_v1.sql` through `20260731090331_network_command_layer_v1.sql` (18 files) | Network autonomy layer — backbone, publishers, scoring/realtime, hardened triggers, briefs, autonomy spine, agent RPCs, incron autonomy, day-one engine, resume, economy layer, weekly rituals, pending admins, launch plan(s), daily brief countdown, learning loop, watchdog, trust ladder, command layer | ✅ applied (backfilled) ⚠️ see network note above |
| — | `20260801121329_pause_non_raelynn_artists.sql` | Pauses non-RaeLynn artists | ✅ applied (backfilled) |
| — | `20260801125906_pause_family_artists.sql` | Pauses family artists | ✅ applied (backfilled) |
| — | `20260803195847_rewards_expansion_enum_presave.sql` | Rewards enum: presave | ✅ applied (backfilled) |
| — | `20260803195854_rewards_expansion_enum_radio_support.sql` | Rewards enum: radio support | ✅ applied (backfilled) |

**How to apply new migrations going forward:** Supabase dashboard → SQL Editor → paste raw file contents from <https://github.com/KevinJonasSr/Superfan-platform/tree/main/supabase/migrations> → Run. Confirm the "destructive operations" dialog when it appears (it's always just `drop policy if exists` / `drop trigger if exists` being safely idempotent). Going forward, prefer running new migrations through this repo's file-based flow rather than the SQL editor directly, so this table doesn't drift from reality again.

---

## 🔐 Vercel env vars to set

| Variable | Purpose | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase connection | ✅ set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ set |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin-scoped Supabase operations | ✅ set |
| `MAILCHIMP_API_KEY`, `MAILCHIMP_SERVER_PREFIX`, `MAILCHIMP_AUDIENCE_ID` | Email subscribe + broadcast | ✅ set |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | SMS outbound | ✅ set |
| `ADMIN_EMAILS` | Allowlist for `/admin/*` access | ✅ set |
| `CRON_SECRET` | Protects `/api/cron/send-event-reminders` from public hits | ✅ set |
| `ADMIN_BASIC_USER` + `ADMIN_BASIC_PASS` | Optional extra HTTP Basic Auth on `/admin/*` | ✅ set |
| `STRIPE_SECRET_KEY` | Stripe server-side API key (test mode until launch) | ✅ set |
| `STRIPE_SEED_SECRET` | Bearer token for `/api/admin/stripe-seed` bootstrap endpoint | ✅ set |
| `STRIPE_WEBHOOK_SECRET` | Verifies signatures on `/api/stripe/webhook` — copy from Stripe dashboard → Developers → Webhooks → endpoint → Signing secret | ✅ set |
| **`NEXT_PUBLIC_APP_URL`** | Public origin baked into auth `emailRedirectTo`. Production must be `https://www.fanengagepro.com`. Do not set to `VERCEL_URL` or `fan-engage-pearl.vercel.app`. | **⏳ set to www + redeploy** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (widget). Used on **signup**, **magic-link**, and **forgot-password** only — **password sign-in has no Turnstile**. | ⏳ set before soft-launch if bot protection desired |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret for `/api/turnstile/verify`. When unset, verify allows through (dev). | ⏳ set with site key |
| `TURNSTILE_FAIL_OPEN` | Optional. Default fail-open on Cloudflare upstream/network outages so auth isn't hard-blocked. Set `0`/`false`/`off` to fail-closed on outages. Missing tokens + real challenge failures still fail-closed when keys are set. | optional (default: fail-open) |

Vercel env vars: <https://vercel.com/jonas-group/fan-engage/settings/environment-variables>

---

## 📋 Legal + compliance content

Policy pages and SMS webhook are already live — text is placeholder until counsel returns the real copy.

- [ ] **Terms of Service** — paste final copy into `/admin/policies/terms`, set `effective_date`, uncheck DRAFT
- [ ] **Privacy Policy** — paste final copy into `/admin/policies/privacy`, set `effective_date`, uncheck DRAFT
- [ ] **Cookie Policy** — paste final copy into `/admin/policies/cookie_policy`, set `effective_date`, uncheck DRAFT
- [ ] **Terms audit** — confirm references to Fan Engage, Anthropic, Supabase, Twilio, Mailchimp all match what we actually do
- [ ] **Privacy — data retention + deletion** — lawyer to confirm retention periods (account deletion, post retention, referral log retention)
- [ ] **DMCA / content takedown policy** — if user-uploaded images become a real volume
- [ ] **SMS 10DLC brand + campaign registration** (US carrier requirement) — submit via Twilio Console
- [ ] **Twilio inbound webhook** — point Messaging Service inbound URL to `https://fan-engage-pearl.vercel.app/api/twilio/inbound` so STOP/HELP compliance actually fires. Verify a real STOP message flips the opt-in flag.
- [ ] **COPPA** — if we expect under-13 users, need parental consent flow. Current ToS draft says 13+; confirm with counsel.
- [ ] **Mailchimp welcome automation** — we now tag every new fan with `welcome` at signup (Phase 3e). Configure a Mailchimp Automation in the dashboard to fire a welcome email when the `welcome` tag is applied. Suggested copy: "Welcome to Fan Engage — here's how to earn your first 100 points" with a CTA back to `/artists`.

---

## 🛡️ Save reliability — useFormSave hook rollout

Vercel cold starts intermittently return 503 on Server Action POSTs, which React silently swallows — the form looks like it saved but the data wasn't persisted. The `useFormSave` hook (`frontend/lib/use-form-save.tsx`) wraps Server Actions in retry-on-503 + visible status feedback, surfacing real errors instead of fake successes. Reusable `ModerationButton` (`frontend/app/admin/community/moderation-button.tsx`) covers click-action buttons.

**Already protected (Apr 26, 2026):**

- [x] Artist edit (`/admin/artists/[slug]` ArtistEditForm)
- [x] Artist create (`/admin/artists` CreateArtistForm)
- [x] Reward create (`/admin/rewards/new` NewRewardForm)
- [x] Reward edit (`/admin/rewards/[id]` EditRewardForm)
- [x] Redemption fulfill / refund (`/admin/redemptions` RedemptionAction)
- [x] Event create (`/admin/artists/[slug]` CreateEventForm)
- [x] Community composer (`/artists/[slug]/community` NewPostForm — post / announcement / poll / challenge)
- [x] Admin community moderation (`/admin/community` — pin/unpin, delete post, delete comment, delete entry)
- [x] Fan suspend / unsuspend (`/admin/fans/[id]` ModerationButton)

**Newly protected:**

- [x] **Challenges admin** — `/admin/challenges` pick-winner + delete-entry actions (`EntryActions`)
- [x] **Offers admin** — `/admin/offers` create (`NewOfferForm`) + active/hidden toggle (`OfferActiveToggle`)
- [x] **Policies admin** — `/admin/policies/[slug]` save/publish/draft toggle (`PolicyEditForm`)
- [x] **Campaigns admin** — `/admin/campaigns/new` builder (`createAndPublishCampaign` converted from `redirect()` to the `{ success, ... }` return contract; builder now shows save status + business errors and navigates via `router.push` on success)

**Remaining unprotected — recommended before public launch:**

- [ ] **Event delete + send-reminder** — `/admin/artists/[slug]/page.tsx` still has two `<form action={X}>` buttons inside the events list. Replace with `<ModerationButton>`.
- [ ] **Founders admin** — `/admin/founders/*` whatever click actions exist there (claim/revoke/comp).
- [ ] **Authentication forms** — login, signup, magic-link request. Lower priority because failures here are usually clearly visible (no auth = redirect loop), but worth doing for consistency.
- [ ] **Onboarding profile form** — `/onboarding/*` whatever form sets first_name + city + DOB. Same silent-503 risk on profile creation.
- [ ] **Marketplace purchase / Stripe Checkout buttons** — these go through Stripe so are mostly Stripe's responsibility, but the "create checkout session" server action is ours and could 503.

**Pattern (for any future contributor):**

For form submits with FormData:

```tsx
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";

const { status, submit, submitting } = useFormSave({
  onSuccess: () => router.refresh(),
});

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const result = await submit(myServerAction, fd);
  if (result?.success) router.push("/somewhere");
  else if (result?.error) setBusinessError(result.error);
}

return (
  <form onSubmit={handleSubmit}>
    ...
    <SaveStatusIndicator status={status} />
    <button disabled={submitting}>{submitting ? "Saving…" : "Save"}</button>
  </form>
);
```

For typed-arg click buttons (toggle, delete, suspend):

```tsx
import ModerationButton from "@/app/admin/community/moderation-button";

<ModerationButton
  action={someAction}
  fields={{ id: someId }}
  label="Delete"
  variant="delete"
  confirmMessage="Sure?"
/>
```

**Server-action contract:** when refactoring, change actions that previously called `redirect()` on success to instead `return { success: true, ...payload }`. The hook treats `redirect()` as a thrown error and would mistakenly retry. Actions that just `revalidatePath()` and return void are fine as-is.

**Lesson learned:** ship coupled refactors as a single multi-file commit. Splitting actions.ts into one commit and the caller into another causes the intermediate deploy to fail TypeScript compile (the action's new return type mismatches the form's old contract). Production recovers when the second commit lands, but the deploy history shows red rows.

---

## 🌐 Domain + production polish

- [ ] **Custom domain** — point a real domain (e.g. `fanengage.app`) at the Vercel project; add DNS records; set as primary
- [ ] **Update Supabase Site URL + redirect URLs** to `https://www.fanengagepro.com` (Site URL) and allow `https://www.fanengagepro.com/**` plus `https://fanengagepro.com/**`. Keep preview `*.vercel.app` redirects if needed. Until this is set, GoTrue rewrites `emailRedirectTo` to the Site URL (`fan-engage-pearl.vercel.app`).
- [ ] **Update Mailchimp campaign from-domain** to match
- [ ] **Set `NEXT_PUBLIC_APP_URL`** to the custom domain so unsubscribe links use it
- [ ] **Favicon + OG image** — polish the social preview when someone shares a Fan Engage link

---

## 🎨 Content to finalize

- [x] **RaeLynn bio** — replaced placeholder with full copy + Luke Bryan select-date opener line
- [x] **RaeLynn hero image** — leopard-coat-at-barn photo uploaded; rendered in artist page hero section
- [x] **RaeLynn accent colors** — retuned from pink/yellow to honey gold → deep espresso brown to match leopard palette
- [x] **Hero image crop fix** — `objectPosition: center 30%` on the wide hero so faces stay visible; `object-top` on 3:4 portrait strip + directory cards
- [ ] **Other artist bios** — replace "Placeholder bio — awaiting final copy" in `/admin/artists/[slug]` for Danger Twins, Dan Marshall, Hunter Hawkins
- [ ] **Other artist hero images** — Danger Twins still uses gradient fallback (Dan and Hunter already have heroes)
- [ ] **Tour dates** — replace "TBD" / "Dates to come" events with real tour dates once announced
- [ ] **Social links** — fill in TikTok, Spotify, Apple Music, Instagram per artist
- [ ] **Merchandise** — Phase 3 stashed this as "offers-per-artist" follow-up
- [ ] **Marketing landing / `/` copy** — the root route may need a sharper pitch for new visitors

---

## 🔒 Admin + security

- [x] **`ADMIN_BASIC_USER` + `ADMIN_BASIC_PASS`** in Vercel (optional second password layer)
- [x] **Jonas Group team admin access** — kevinjonassr@gmail.com, carla@jonasgroup.com, raymond@jonasgroup.com, paul@jonasgroup.com, george@jonasgroup.com all in `ADMIN_EMAILS` allowlist
- [ ] **SSO / team accounts** — if other team members need admin access beyond the email allowlist
- [ ] **Audit log** — who did what in the admin UI (moderation actions, campaign sends, policy edits)
- [ ] **Rate limiting** on public API routes (`/api/upload`, `/api/fan-engage/*`) — upstash/ratelimit is cheap to add
- [ ] **Image upload limit enforcement** — `image-uploader.tsx` resizes to <4 MB client-side, but the `/api/upload` route also has an 8 MB cap that's currently moot because Vercel rejects bodies >4.5 MB before the function runs. Either bump the cap to match Vercel's reality or document the truth.

---

## 📊 Observability

- [ ] **Error tracking** — Sentry or Vercel's built-in logs; decide + wire up
- [ ] **Uptime monitoring** — especially for the cron (Vercel Crons logs are minimal)
- [ ] **Email + SMS deliverability dashboard** — surface bounce/complaint rates inside `/admin/analytics`
- [ ] **503 root-cause investigation** — the cold-start 503s that drove the useFormSave rollout are still happening in the background; the hook just papers over them. Worth diagnosing properly: confirm Vercel deployment region matches Supabase region, audit `getAdminUser()` for extra DB round-trips, consider Supabase pooler URL.

---

## 📈 Nice-to-have before scale

- [ ] **Per-artist Mailchimp segmentation** — email blasts still go to whole audience; SMS is already per-artist/event
- [ ] **Offers-per-artist + marketplace integration** — connect campaign-created offers to artist pages
- [x] **Fan Home personalization** — live feed of followed artists' activity (Phase 5 work; photo-forward artist cards shipped Apr 26)
- [ ] **Weekly digest cron** — another scheduled blast ("your artists this week")
- [ ] **In-app notifications inbox** — badge earns, RSVP confirmations, challenge wins, new campaigns
- [ ] **PWA manifest** — add-to-home-screen, offline shell
- [ ] **Leaderboards** — per-artist top fans by points / referrals
- [ ] **Onboarding welcome email + SMS** — fire a welcome message right after signup
- [ ] **Data export + delete-account** (CCPA/GDPR self-serve)
- [ ] **Per-artist hero focal-point control** — currently every wide hero uses `objectPosition: center 30%` as a global default, which works for most portrait artist photos but not all (subjects framed lower than typical, group shots, landscape-oriented portraits, etc.). Add a `hero_focal_y` smallint column (0–100, default 30) to the `artists` table, surface it in the `/admin/artists/[slug]` edit form (a slider or a numeric input next to the hero uploader, ideally with a live preview rendering of the chosen crop), and read it in `frontend/app/artists/[slug]/page.tsx` as `style={{ objectPosition: \`center ${artist.heroFocalY ?? 30}%\` }}`. Optional: add `hero_focal_x` too if landscape photos ever need horizontal repositioning. Estimated work: ~1 hour (one small migration + one form field + one render-line change).
- [ ] **Fan Home Recent Activity expansion** — the data layer (`frontend/lib/data/fan-home.ts`) already pulls the 5 most recent community posts from followed artists, but the dashboard (`frontend/components/fan-home-dashboard.tsx` `<RecentActivityFeed>`) only renders the top 3. Two related upgrades worth picking up post-launch: (1) bump the visible count to 5 — trivial change to `posts.slice(0, 3)` — and/or raise the data layer's `.limit(8)` if we want a deeper feed; (2) add a "View all activity →" link at the bottom of the card that routes to a new per-fan activity index page (e.g. `/activity` or `/feed`) showing every recent post across followed artists, paginated, with body bodies and reactions. The index page would basically be a cross-artist version of `/artists/[slug]/community`. Estimated work: ~2 hours for the link + index page; ~5 minutes for the count bump on its own.
- [ ] **Platform-wide badges architecture** — migration 0023 (`0023_fix_award_badge_delegate.sql`) shipped a tactical fix for the signup 42P10 by having `award_badge(uuid, text)` delegate to `award_community_badge(uuid, text, text)` with a hard-coded `community_id = 'raelynn'`. This works because every historical `fan_badges` row is already scoped to `'raelynn'` (the table's column default), but it's architecturally wrong: badges like `welcome`, `tier-bronze`, `recruiter`, `first-post`, `first-comment`, etc. are platform-wide achievements, not RaeLynn-specific ones. Two clean ways to fix it post-launch: (a) add a `'platform'` (or `'*'`) row to the `communities` table and use that as the default for non-scoped badges — minimal schema change, ~30 minutes including a backfill `update fan_badges set community_id = 'platform' where badge_slug in (...)`; or (b) split into separate `platform_badges` (one row per fan per badge) + `community_badges` (one row per fan per badge per community) tables — more correct data model but requires a migration that re-shards existing rows + updates every read path. Either way, also worth adding a `badges.scope` column with values `'platform' | 'community'` so the data layer can route awards to the right table/community without hard-coded slug lists. Tracker for the delegation hack: see migration 0023 header comment.
- [ ] **Voice-driven community submissions (recs doc #11)** — a "🎤 Hold to record" button in the post composer that captures a voice memo (Web Audio API → MediaRecorder → POST as multipart audio), transcribes it via OpenAI Whisper (`audio/webm` or `audio/mp4` → `whisper-1`), and pre-fills the post body with the transcription. Good for accessibility (fans with motor / vision difficulties), faster mobile posting (talk > thumb-typing), and works particularly well for tour recaps and meet-and-greet stories that fans naturally narrate. **Why deferred per the recs doc:** Score 0.5 — useful but lower-priority than #6/#8/#10 (which all shipped) and not worth the moderation lift while the platform is still small. **What we'd build:** (1) `frontend/app/api/transcribe/route.ts` — auth-gated POST that accepts an audio blob (max ~25MB per OpenAI limit), forwards to `whisper-1`, returns `{ text }`. ~50 lines. (2) `frontend/app/artists/[slug]/community/voice-recorder.tsx` — client component with a hold-to-record button, MediaRecorder lifecycle, basic waveform visualization, and a "Use this transcription" handoff into the existing `CommunityComposer`. ~150 lines. (3) Wire it into `CommunityComposer` as an optional toggle next to the ✨ drafter button. **Cost:** Whisper is $0.006/minute. A community with 100 voice posts/month averaging 30 sec = $0.30/mo. Negligible. **Risks:** (a) audio inputs need a stricter moderation pass — voice can carry slurs that text-prompt classifiers miss in their text-only context; we'd want to keep the same Phase 2 moderation gate on the resulting text but also consider rejecting audio with profanity above a threshold (Whisper itself returns a confidence-per-word that we could read). (b) UX rough edges on mobile Safari — `MediaRecorder` codec support is uneven; we'd need a fallback to `audio/mp4`. (c) Privacy ask — we have to surface "Audio processed by OpenAI" in the consent copy. **Estimated work:** ~1 day end-to-end including a small smoke test pass. Worth picking up after content threshold is hit (>20 posts/week per active community) so the accessibility win has actual users to serve.

## 📧 Mailchimp digest field length watch (Phase 4)

After the first few weekly digest sends, monitor whether the
`*|DIGESTHTML|*` merge field is being truncated by Mailchimp.
Symptoms: emails arrive with HTML cut off mid-element (e.g. an open
`<div>` with no closing tag, a link href that ends abruptly), or the
"reward suggestion" / later community blocks missing entirely from
fans who follow 3 active communities.

**Why this might happen:** Mailchimp Standard plans cap custom text
merge fields at 255 chars by default. The Phase 4 digest renders
HTML in the 800-3,500 char range per fan — fits for fans with one
sparse community, breaks for fans with 3 active communities + a
reward block.

**Watch query (run weekly):**

```sql
-- Distribution of HTML body lengths
select width_bucket(length(html_body), 0, 6000, 6) as bucket,
       count(*) as digests,
       round(avg(length(html_body))) as avg_chars
from public.digest_log
where status in ('sent', 'merge_fields_updated')
  and sent_at > now() - interval '14 days'
group by 1 order by 1;

-- Specific digests over Mailchimp's likely truncation point
select fan_id, length(html_body), array_length(payload_communities, 1) as communities,
       array_length(payload_post_ids, 1) as posts
from public.digest_log
where length(html_body) > 1500
order by length(html_body) desc limit 20;
```

**If truncation is happening, three options ranked by impact / effort:**

- [ ] **Option A — Upgrade Mailchimp plan** (lowest effort, fastest
      fix). Standard tier may cap merge fields at 255-1000 chars
      depending on grandfathered settings; Premium tier raises this.
      Verify the actual limit on the Jonas Group account by trying
      to bump the field length in the Mailchimp UI:
      https://us16.admin.mailchimp.com/audience/merge-fields/?id=554139
      → click `…` next to "Digest HTML Block" → Edit → look for a
      "Max length" or character-limit field. If it's editable, just
      raise it. If it's not editable, that's a plan-level cap and
      upgrading is the path. ~$0-50/mo additional cost.
- [ ] **Option B — Switch to Mandrill (Mailchimp Transactional)** —
      separate Mailchimp product, ~$10/mo for 5k transactional
      emails. Designed for per-recipient HTML; no merge-field length
      cap. Refactor `frontend/lib/digest/send.ts` to call the
      transactional API instead of the campaign API + merge-field
      pattern. ~30 minutes of work, plus signup + API key in env.
      The campaign template HTML in `send.ts` becomes the per-send
      HTML; no campaign-level Mailchimp template needed.
- [ ] **Option C — Split into multiple shorter merge fields** —
      stay on Marketing API, decompose `DIGESTHTML` into ~10
      smaller fields (`DG_VIBE_1`, `DG_POST_1A`, `DG_EVT_1A`, etc.)
      and a richer template in Mailchimp. More code work (~2 hours),
      no plan upgrade, but the template becomes rigid (every fan
      needs the same shape; one missing community = empty section).
      Save this for if A and B don't make sense.

**Recommendation:** start with A — try editing the merge field's
max length in the Mailchimp UI and see if Mailchimp lets you raise
it. If yes, problem solved at zero cost. If no, B is the cleanest
upgrade path.

---

## 🤖 AI roadmap pause gate

After Phase 4 (weekly digest emails), Fan Engage has four shipped AI
features in flight: embedding pipeline (#1), moderation classifier
(#2), drafter (#3), digest emails (#4). Before adding more AI surface
area (Phase 5+ — auto-tagging posts, semantic search, reward
recommendations, smart reminders, etc.), wait until the shipped
features have ~2 weeks of real engagement data and validate the
hypotheses on each:

- [ ] **Drafter (#3)** — does it actually lift comment volume on
      posts where the ✨ button is shown? Target from the recs doc:
      +30% comment volume. Run the queries in the "📈 AI feature
      metrics — drafter A/B (Phase 3)" section below. If lift is
      <10%, fix the drafter (better prompt, more prominent button,
      regen sub-buttons) before shipping more AI features.
- [ ] **Digest (#4)** — does it actually move retention? Track
      Mailchimp open rate (target: >25%), click-through (target:
      >5%), 7-day return-to-app rate among recipients (target:
      +15% vs. non-recipients). If the digest doesn't lift any of
      these, the rec doc's claim that "personalized weekly briefing
      is the highest-leverage email" was wrong for this audience —
      pause the cron and rethink before shipping #5+.
- [ ] **Moderation (#2)** — does the classifier under-flag (toxic
      content reaches the community) or over-flag (admins drown in
      false positives)? Audit `/admin/moderation` once a week:
      review every `flag_review` decision, override the wrong
      ones. The override rate IS the eval signal — bump
      `PROMPT_VERSION` in `frontend/lib/moderation/client.ts` if
      override rate >25%.
- [ ] **Embeddings (#1)** — passive infrastructure; nothing to
      validate until a downstream feature (search, recs) reads it.
      Just check `select count(*) from public.content_embeddings`
      keeps growing with new posts.

The AI recs doc has 16 more features queued (#5–#20). Don't ship
any of them until the data above looks healthy. The cost of
shipping more half-validated features is feature dilution +
moderation overhead + AI bill creep, none of which are worth it
without proof the pattern works.

Tracker file: `FAN_ENGAGE_AI_RECOMMENDATIONS.md` (full roadmap).
Operational docs: `docs/AI_INFRASTRUCTURE.md` (per-phase setup,
costs, failure modes).

---

## 🏷️ AI feature metrics — auto-tagging (Phase 5)

Use these queries after the tagging cron has had a few weeks of real
posts to validate the closed-vocabulary classifier is calibrated +
to surface re-classification opportunities.

### Backfill health (run anytime — should trend toward zero)

```sql
select
  count(*) filter (where tagged_at is not null) as tagged,
  count(*) filter (where tagged_at is null
                   and (moderation_status is null or moderation_status != 'auto_hide')
                   and length(coalesce(body,'')) > 0) as pending,
  count(*) filter (where tagged_at is null
                   and moderation_status = 'auto_hide') as skipped_auto_hide
from public.community_posts;
```

`pending` should be near zero — anything stuck means the cron is
failing. Check Vercel runtime logs for `/api/cron/tags-backfill`.

### Tag distribution per community

```sql
select p.artist_slug, t.tag, count(*) as n
from public.community_posts p, unnest(p.tags) as t(tag)
where p.tagged_at is not null
group by 1, 2
order by 1, n desc;
```

Watch for two failure modes:
  * **Over-concentrated** — one community has >40% of posts tagged
    `other`. Means the closed vocabulary doesn't cover what fans are
    actually posting about. Bump `TAG_PROMPT_VERSION` and add 1-3 new
    canonical tags.
  * **Mono-tag bias** — one tag (e.g. `live_show`) covers >60% of a
    community's posts. Either it's the right call (artist literally
    only posts about shows) or the classifier is reaching for a
    fallback. Sample 10 rows tagged with that value and confirm.

### Filter chip preview (what fans will see)

```sql
select * from public.list_top_tags_for_community('raelynn', 12);
```

Repeat per artist. The chip count + ordering on the live community
page should match exactly.

### Re-classification on prompt-version bump

When you bump `TAG_PROMPT_VERSION` in `frontend/lib/tagging/client.ts`
(e.g. after adding new vocabulary tags), mark stale rows for re-tagging:

```sql
update public.community_posts
set tagged_at = null
where tag_prompt_version is null
   or tag_prompt_version != 'v2';  -- the new version
```

The backfill cron picks them up within 15 min and re-tags. Cost: same
as the original backfill (~\$0.0001 per row).

### Drafter / tagging cross-check (post-launch insight)

Once both the drafter (Phase 3) and tagger (Phase 5) have data, you
can correlate them — drafted comments tend to land on which kind of
posts? Useful for validating the drafter's A/B lift hypothesis is
specifically about engaging content vs. just shorter posts:

```sql
-- Comment volume by post tag, split by drafter usage
select t.tag,
       count(*) as comments,
       count(*) filter (where c.draft_used) as drafted,
       round(100.0 * count(*) filter (where c.draft_used) / nullif(count(*), 0), 1) as drafted_pct
from public.community_comments c
join public.community_posts p on p.id = c.post_id, unnest(p.tags) as t(tag)
where c.created_at > now() - interval '14 days'
  and p.tagged_at is not null
group by 1
order by comments desc;
```

If `drafted_pct` is wildly different across tags (e.g. 50% on
`fan_question` posts but 5% on `tour_announcement`), that's a real
signal — the drafter helps members engage with question-style posts
more than announcement-style ones, which informs both the drafter
prompt and the surfacing logic.

---

## 📈 AI feature metrics — drafter A/B (Phase 3)

Use these queries after the comment drafter has been live for a few
weeks to validate the rec doc's +30% comment-volume hypothesis (see
`FAN_ENGAGE_AI_RECOMMENDATIONS.md` recommendation #3 and
`docs/AI_INFRASTRUCTURE.md` Phase 3).

### Most recent comments (sanity check that draft_used is being recorded)

```sql
select id, body, draft_used, created_at
from public.community_comments
order by created_at desc
limit 10;
```

### A/B comparison (works once you have ~50+ comments)

```sql
select draft_used,
       count(*)                  as comments,
       avg(length(body))::int    as avg_chars
from public.community_comments
where created_at > now() - interval '14 days'
group by 1;
```

### Drafter usage rate (proxy for whether members find the ✨ button)

```sql
select 100.0 * count(*) filter (where draft_used)
       / nullif(count(*), 0) as drafter_share_pct
from public.community_comments
where created_at > now() - interval '14 days';
```

Reading the result: < 10% drafter share = button isn't being seen
(consider making it more prominent on the post card). > 40% = members
love it (consider improving draft quality, adding regenerate-per-chip
sub-buttons, etc.). Anywhere in between is good enough to keep
shipping more AI features on top.

---

## 🔍 AI feature metrics — semantic search (Phase 6)

Search ships dark — there's no separate event log table; we lean on
Vercel Analytics + runtime logs to track usage. The queries below
help validate quality + cost without building a logging schema we
might not need.

### Smoke test (run from the Supabase SQL editor)

```sql
-- Confirm content_embeddings has rows from every source_table.
-- If any of these is 0, search will silently miss that surface.
select source_table, count(*) as embeddings
from public.content_embeddings
group by 1
order by 1;
```

Expect non-zero counts for `community_posts`, `community_comments`,
`communities`, `artist_events`, `rewards_catalog`. If a row is
missing, check the embedding cron + the inline-trigger paths in the
relevant server actions.

### Visibility filter sanity check

```sql
-- Search uses p_visibility = 'public' by default. Anything below
-- 'public' (premium / founder-only) must NOT come back.
select source_table, visibility, count(*)
from public.content_embeddings
group by 1, 2
order by 1, 2;
```

If you see meaningful `premium` / `founder-only` row counts, the
filter inside `search_embeddings()` is what keeps them out of /search
results — verify by spot-querying the RPC manually with a test
embedding.

### Query distance distribution (quality tuning)

After search has run for a couple of weeks, sample raw RPC distances
to validate `MAX_DISTANCE = 0.85` is the right threshold. Ad-hoc:

```sql
-- Pick a representative query, embed it client-side, paste the
-- pgvector literal here. Returns the top 30 with their distances —
-- look at where the relevance cliff actually is.
select source_table, source_id, distance
from public.search_embeddings(
  '[...paste 1536-dim vector...]'::vector,
  null,
  'public',
  null,
  30
)
order by distance asc;
```

Heuristic: if distances 5–15 already feel off-topic, tighten
`MAX_DISTANCE` in `lib/search/query.ts` (e.g. 0.7). If distances at
0.85 still feel relevant and the page shows few results, loosen it.

### Cost watch

OpenAI text-embedding-3-small is so cheap per query that the cost is
dominated by the indexing-side embedding (one per post / comment /
event / reward / community). Search-side cost target: < $1/month
even at 100k queries.

If the OpenAI bill spikes:
  1. Check the embeddings backfill cron — a stuck loop will reprocess
     the same rows.
  2. Check `/api/search` traffic in Vercel Analytics — a bot or
     someone scripting against the public endpoint can rack up calls.
     The endpoint is unauth'd by design; if abuse becomes real we'll
     add IP-based rate limits.

### Smoke test (run when there's enough content to be meaningful)

Don't bother running this until the platform has at least:
  - 3+ active artist communities
  - ~50+ posts spread across them
  - ~20+ comments
  - ~5+ active rewards in the catalog
  - ~10+ upcoming events

Below that threshold, search results will look thin no matter how
well the pipeline works — there just isn't enough content to find.

When ready, run through:

1. **Header bar visible (desktop, lg+ breakpoint)** — Hard-refresh
   `/`. Search bar should sit between the nav and the avatar/sign-in.
2. **Header bar hidden (mobile, < lg breakpoint)** — Search bar
   should NOT show. Open the user menu (signed-in only) and confirm
   the `Search` link is present under `My rewards`.
3. **Direct query** — Visit `/search?q=tour` (or whatever your active
   artists post about). Confirm results are grouped by Communities,
   Posts, Comments, Events, Rewards, and that each result links back
   to its source page.
4. **Synonym test** — Search for a term that doesn't appear verbatim
   in any post but is conceptually related (e.g. "concert" when posts
   say "show", or "merch" when posts say "tee"). Confirm relevant
   results still come back. If they don't, semantic similarity is
   broken upstream — check that posts have rows in
   `content_embeddings`.
5. **Empty state** — Search for `aardvark surfing`. Should show the
   "no matches" friendly state, not a crash.
6. **Short-query gate** — Search for `a`. Should show the prompt page
   without burning an OpenAI call (check Vercel runtime logs to
   confirm no `embedText` call fired).
7. **Auto-hide leakage** — Pick a moderated `auto_hide` post (find
   one in `community_posts where moderation_status = 'auto_hide'`).
   Confirm a search for its body doesn't surface it. (If it does,
   the source-row filter in `lib/search/query.ts` regressed.)
8. **Visibility leakage** — As a signed-out user, confirm
   `premium` and `founder-only` content is not in results. (Search
   the title of a known premium-only post.)
9. **Performance** — Bottom of the results page shows a duration in
   ms. Should be < 800ms in production. If above 1500ms consistently,
   investigate Supabase RPC latency or `RAW_LIMIT` size.
10. **Cron sanity** — Run the `select source_table, count(*) ...`
    query above and confirm every source_table has rows. If any is
    zero, search is silently missing that surface.

After all 10 pass, search is launch-ready.

---

## 🎯 AI feature metrics — event-match notifications (Phase 8)

The smart-match flow at `/admin/artists/[slug]/events/[id]/match`
ships dark — it's admin-only and never auto-sends. These queries
plus a content-threshold-gated smoke test let us verify the scoring
is sane before fans see anything.

### Backfill health (cron is keeping up)

```sql
select
  count(*) filter (where match_processed_at is not null) as scored,
  count(*) filter (where match_processed_at is null
                   and active = true
                   and (starts_at is null or starts_at > now())) as pending
from public.artist_events;
```

`pending` should hit zero within ~15 minutes of any new event being
created. If it doesn't, check Vercel logs for
`/api/cron/event-match-prepare`.

### Score distribution per event (sanity check)

```sql
select
  e.title,
  count(*) as total_followers,
  count(*) filter (where l.is_candidate) as candidates,
  round(avg(l.total_score)::numeric, 3) as avg_score,
  round(max(l.total_score)::numeric, 3) as max_score,
  round(min(l.total_score)::numeric, 3) as min_score
from public.event_match_log l
join public.artist_events e on e.id = l.event_id
group by 1
order by 1;
```

Watch for:
  * **Everyone is a candidate** → either follower pool is tiny (fine)
    or the 0.15 min-score floor is too low.
  * **Nobody is a candidate** → either the artist has no past events
    AND no engagement history (early days for them), or a scoring
    component regressed. Manually call `matchEvent(eventId)` and
    inspect score_components for one row.
  * **All scores are ~0.1** → geo is failing (city strings don't
    match), engagement is empty, no past RSVPs. Investigate fans.city
    population.

### Component breakdown (which signal carries the score)

```sql
select
  round(avg((score_components->>'geo')::numeric), 3)            as avg_geo,
  round(avg((score_components->>'past_rsvp_rate')::numeric), 3) as avg_rsvp,
  round(avg((score_components->>'engagement')::numeric), 3)     as avg_eng,
  round(avg((score_components->>'tier_weight')::numeric), 3)    as avg_tier
from public.event_match_log
where computed_at > now() - interval '7 days';
```

If `avg_eng` and `avg_rsvp` are both ~0, the only signals doing
anything are geo + tier_weight, which means we're effectively
shipping #8 without its main differentiator. Wait until there's
enough RSVP / engagement history.

### Send efficacy (post-send only)

```sql
select
  count(*) filter (where 'in_app' = any(channels_sent)) as in_app_sent,
  count(*) filter (where 'sms'    = any(channels_sent)) as sms_sent,
  count(*) filter (where sent_at is not null
                    and channels_sent = '{}')          as sent_with_no_channels
from public.event_match_log
where sent_at > now() - interval '14 days';
```

`sent_with_no_channels` should be zero. If it's not, the send loop
is stamping rows without firing anything — bug.

### Smoke test (run when there's enough activity to be meaningful)

Don't bother running this until the platform has at least:
  - 1 artist with a future event scheduled
  - 5+ fans following that artist
  - At least 1 past event from that artist with 1+ RSVP recorded
  - At least 1 fan with `sms_opted_in = true` and a real phone

Below that threshold, the score components don't have enough signal
to differentiate candidates and the test doesn't tell you anything.

When ready, run through:

1. **Match preview link visible** — `/admin/artists/<slug>` shows
   the 🎯 Match preview link beside ✏️ Edit on each event row.
2. **First-visit auto-score** — Click Match preview on an event
   that's never been scored. The page should compute candidates
   inline (slow first time, ~1-3s) and stamp
   `artist_events.match_processed_at`.
3. **Re-score idempotency** — Click Re-score. Counter changes
   nothing; rows in `event_match_log` get overwritten with fresh
   values; no duplicate rows added.
4. **Score component sanity** — Pick one fan in your audience whose
   city matches the event location. Their `geo` should be 1.0; total
   should be highest. Pick another fan whose city doesn't match —
   their geo should be 0 (or 0.5 same-state).
5. **Top-25% cap** — If the artist has 8+ followers, the candidate
   count should be ≤ 25% of the total scored count.
6. **Send (real fans, dry-run mode)** — In dev / staging only: click
   Send notifications. Verify:
       - One row appears in `notifications` per candidate with
         `kind = 'event_match'` and a stable `dedup_key`.
       - SMS only fired for fans with `sms_opted_in = true` AND a
         non-empty phone.
       - `event_match_log.sent_at` + `channels_sent` are populated.
7. **Idempotent re-send** — Click Send again on the same event.
   `attempted` returns 0 because there are no unsent candidates.
   No new `notifications` rows. No SMS billed.
8. **Dedup on re-send across runs** — Manually clear
   `event_match_log.sent_at` for one fan. Re-click Send. The fan
   gets stamped sent_at again but the `notifications` row is NOT
   duplicated (dedup_key holds the line).
9. **Twilio missing** — Temporarily unset `TWILIO_ACCOUNT_SID` env
   var and Send. In-app rows still write; SMS counters are 0.
10. **No followers** — Trigger Match preview for an event whose
    artist has zero followers. Page should render the empty-state
    message gracefully.

After all 10 pass, the smart-match flow is launch-ready.

### Real geocoding (post-launch upgrade)

v1 uses string substring + state-token match for `geo`. Real
geocoding (lat/lng + sigmoid over miles) is a Phase 8.7 upgrade:

- Add `fans.lat / lng` and `artist_events.lat / lng` columns.
- Backfill via Google Geocoding API or Mapbox (~$5 per 10k
  geocodes, both keep results valid for 30 days per ToS).
- Replace `scoreGeo()` with: `clamp01(1 - distanceMiles / 250)`
  (250 mi = 0.0; same city ~ 0.99).

Worth it once we have multi-state events + enough fans for the
fuzzy city-string match to be the bottleneck.

---

## 🎁 AI feature metrics — reward recommendations (Phase 10)

The hero card on /artists/[slug]/rewards. These queries validate
the recommendation makes sense before fans see it.

### Embedding coverage (must be non-zero before recs work)

```sql
select count(*) as embedded_rewards
from public.content_embeddings
where source_table = 'rewards_catalog';
```

If this is 0, no recommendations will fire (RPC returns 0 rows for
everyone, cold-start fires). Check the embeddings backfill cron.

### Per-fan dry-run (sanity check)

Pick a fan who has at least one past redemption:

```sql
-- Replace <fan_id> + <community_id> with real values.
select * from public.recommend_rewards_for_fan(
  '<fan_id>'::uuid, '<community_id>', 5
);
```

Returns top-5 candidates by affinity score. Spot-check the rank
order against your intuition. If a clearly-irrelevant reward sits
at #1 (e.g., a 'merch_discount' for a fan who only ever redeems
'experience' kinds), the embedding text needs more context — bump
the rewards_catalog text in the embedding pipeline to include
`kind` so it influences the vector.

### Affinity vs cold-start mix (post-launch insight)

After the rec card has been live for a couple weeks:

```sql
-- We don't log impressions today, but Vercel route logs +
-- a future click-through table will let us answer:
--   - What fraction of /rewards page renders showed an affinity
--     pick vs a cold-start pick?
--   - Did fans click affinity recs at higher rates?
-- For now, this query approximates 'how many fans even have any
-- redemption history that the affinity path could engage with':
select
  count(*) filter (where redeemed >= 1) as has_history,
  count(*) filter (where redeemed = 0)  as cold_start,
  count(*)                              as total
from (
  select f.id, count(rr.id) as redeemed
  from public.fans f
  left join public.reward_redemptions rr
    on rr.fan_id = f.id
   and rr.status in ('pending','fulfilled')
  group by f.id
) sub;
```

Healthy ratio depends on platform maturity. Day 1: nearly all fans
will be cold-start (expected). Month 3+: should trend toward 50/50.

### Smoke test (run when there's enough history to be meaningful)

Don't bother running this until:
  - At least 3 active rewards in rewards_catalog for the test community
  - At least 1 fan has redeemed something (so the affinity path can
    actually fire)
  - Embedding coverage query above is non-zero

When ready, run through:

1. **Hero card visible** — Sign in as a fan with ≥1 past redemption,
   visit /artists/<slug>/rewards. Hero card renders at top with the
   "✨ For you" chip.
2. **Affinity reason** — Caption reads "Based on the N rewards
   you've redeemed." (N = your past-redemption count, capped at 20).
3. **Cold start — popular** — Sign in as a brand-new fan with zero
   redemptions but on a community where someone redeemed something
   in the last 30 days. Caption reads "Popular with fans this month
   and within your points."
4. **Cold start — cheapest** — Sign in as a brand-new fan in a
   community with zero redemptions ever. Caption reads "An easy
   first redemption."
5. **Affordability filter** — Set a fan's total_points to 100 in
   the database. Reload /rewards. The recommendation must have
   point_cost ≤ 100. If it doesn't, the SQL filter is broken.
6. **Tier filter** — Make a reward with requires_tier='premium'.
   Sign in as a free fan (subscription_tier='free'). Reload. The
   premium-only reward must NOT be the recommendation.
7. **Recency filter** — Have a fan redeem reward X. Within 30 days,
   reload /rewards. Reward X must NOT be the recommendation
   (someone else gets it OR a different reward wins).
8. **Hide behavior** — Click Hide on the hero card. URL gains
   ?dismiss_rec=1. Card is gone. Reload without the param — card
   returns. (Per-page-view dismiss only; not session-persistent
   by design.)
9. **No eligible rewards** — In a community with 0 active rewards,
   the page renders without the hero card AND without crashing.
10. **RPC down** — Simulate by temporarily renaming the function in
    Supabase ('alter function recommend_rewards_for_fan rename to
    _broken'). Reload /rewards. Page should fall back to cold-start
    silently and still render.

After all 10 pass, recommendations are launch-ready.

### Phase 10.5 — marketplace integration (post-launch)

`/marketplace` reads from `offers` (NOT `rewards_catalog`). Today
the embedding pipeline doesn't touch offers. To extend:

```
1. Add 'offers' to lib/embeddings/sources.ts:SOURCES.
2. Add an offers branch to indexRow() so create/update flows embed.
3. Add offers to list_unembedded_rows() in migration 0024 (or a
   small migration 0030.5).
4. Either (a) generalize recommend_rewards_for_fan to take a
   p_source_table arg, or (b) write a sibling
   recommend_offers_for_fan with the same shape.
5. Surface a hero card on app/marketplace/page.tsx using the same
   RecommendedRewardCard pattern.
```

Worth it when marketplace traffic grows or when the offers catalog
exceeds ~10 rows per community.

---

## 📷 AI feature metrics — image captions (Phase 12)

The ✨ Suggest captions button on the post composer. Tracks fan
adoption + engagement lift via the caption_used flag.

### Adoption rate (proxy for whether the button is being seen)

```sql
select
  count(*)                                          as photo_posts,
  count(*) filter (where caption_used)              as ai_captioned,
  round(100.0 * count(*) filter (where caption_used)
        / nullif(count(*), 0), 1)                   as ai_caption_pct
from public.community_posts
where image_url is not null
  and created_at > now() - interval '14 days';
```

Reading: < 5% pct = button isn't being seen (consider making it more
prominent or auto-fire). > 40% = fans love it (consider the V2
auto-pre-fill path documented in AI_INFRASTRUCTURE Phase 12).

### Engagement A/B (post-launch insight)

```sql
-- Comments + reactions per post, split by AI caption usage.
-- Run after >50 photo posts have accumulated.
with post_engagement as (
  select
    p.id, p.caption_used,
    (select count(*) from public.community_comments c where c.post_id = p.id) as comments,
    (select count(*) from public.community_reactions r where r.post_id = p.id) as reactions
  from public.community_posts p
  where p.image_url is not null
    and p.created_at > now() - interval '30 days'
)
select
  caption_used,
  count(*)                  as posts,
  round(avg(comments)::numeric, 2) as avg_comments,
  round(avg(reactions)::numeric, 2) as avg_reactions
from post_engagement
group by 1;
```

The hypothesis: caption_used=true posts have higher reactions (more
specific captions catch attention) but similar comment counts (the
caption itself doesn't ask a question by default). If reactions
don't lift after ~50 posts each side, the system prompt needs a
tone tweak.

### Body length distribution (sanity check)

```sql
select
  caption_used,
  count(*) as n,
  round(avg(length(body))::numeric, 0) as avg_chars,
  percentile_cont(0.5) within group (order by length(body)) as median_chars
from public.community_posts
where image_url is not null
  and created_at > now() - interval '30 days'
group by 1;
```

We expect caption_used=true rows to have BOTH (a) a slightly
shorter median (the AI suggestion is ≤100 chars) AND (b) a longer
average (because the suggestion appends to whatever the fan
already typed). If both are shorter than caption_used=false, fans
are using the AI suggestion as a replacement, not an extension.

### Smoke test (when there's at least one good image to test)

Don't bother running until the platform has at least one fan account
with a real photo to upload (e.g. a tour photo from a recent show).

When ready, run through:

1. **Button hidden before upload** — Open
   /artists/<slug>/community. Click "+ New post". Confirm the
   ✨ Suggest captions button is NOT visible.
2. **Button shown after upload** — Attach an image. Suggester
   panel appears next to the upload preview.
3. **Generates 3 captions** — Click ✨ Suggest captions. Within
   ~3 seconds, 3 chips appear with distinct tones (one
   observational, one enthusiastic with maybe an emoji, one
   ending with a question).
4. **Pick → appends to body** — Click chip #2. Caption appears in
   the textarea body. If you'd already typed something, the
   caption is appended (with a space), not replacing your text.
5. **caption_used flag travels** — Open browser devtools, inspect
   form. Hidden input name="caption_used" has value "1".
6. **Persisted on submit** — Submit the post. Reload Supabase Table
   Editor on community_posts. Latest row shows caption_used=true.
7. **Skip path** — New post, attach image, type a caption manually
   without clicking the suggester. Submit. Row shows
   caption_used=false. Confirms the flag doesn't accidentally
   stay sticky across posts.
8. **Regenerate** — Click ✨ Suggest captions, then ↻ Regenerate.
   Get 3 new options. Different from the first set (temperature
   0.7 ensures variation).
9. **Empty image fallback** — Manually clear the image (re-upload
   a different image). Suggester panel shows the new image's
   captions, not stale ones from the previous upload. (The
   ImageUploader.onUploaded callback resets caption_used.)
10. **API key missing** — Temporarily remove ANTHROPIC_API_KEY in
    Vercel and reload. Click ✨ Suggest captions. UI shows
    'Caption suggester unavailable — API key not configured'
    error inline. The rest of the form still works.

After all 10 pass, captions are launch-ready.

### V2 auto-pre-fill gate (post-launch decision)

If the adoption query shows > 40% AI caption usage AND the A/B
shows reactions lift > 15%, consider flipping to the auto-pre-fill
mode: fire suggestCaptions() the moment the upload completes and
populate caption #1 into the textarea automatically (with the other
2 as alternates). One extra Anthropic call per upload — affordable
unless costs balloon — and saves the fan one click. Don't ship
until both metrics support it.

---

## 📰 AI feature metrics — daily admin brief (Phase 15)

The cron generates a Slack-ready narrative every day at 13:00 UTC
and persists to `admin_briefs`. Admins read it at /admin/briefs.

### Cron heartbeat (must be writing rows daily)

```sql
select
  date_trunc('day', created_at) as day,
  count(*)                       as briefs,
  array_agg(channels_sent)       as channels
from public.admin_briefs
where created_at > now() - interval '14 days'
group by 1
order by 1 desc;
```

There should be exactly one row per day. If there's a gap, check
Vercel logs for `/api/cron/daily-admin-brief` (likely cause:
ANTHROPIC_API_KEY transient failure or Supabase write failure —
either of those skips the row entirely).

### Slack delivery rate

```sql
select
  count(*) filter (where 'slack' = any(channels_sent)) as slack_delivered,
  count(*) as total
from public.admin_briefs
where created_at > now() - interval '30 days';
```

If slack_delivered is 0 but total is > 0, SLACK_ADMIN_WEBHOOK_URL
isn't set or the webhook is invalid. Check Vercel env vars.

### Anomaly volume sanity (post-launch)

```sql
-- Per-day count of warn-level anomalies. A spike here usually
-- means a real problem worth investigating.
select
  date_trunc('day', created_at) as day,
  jsonb_array_length(metrics->'anomalies') as anomaly_count,
  (
    select count(*)
    from jsonb_array_elements(metrics->'anomalies') a
    where a->>'severity' = 'warn'
  ) as warn_count
from public.admin_briefs
where created_at > now() - interval '30 days'
order by 1 desc;
```

### Setup checklist

Before launch:

  - [ ] Apply migration 0032 in Supabase (creates admin_briefs).
  - [ ] (Optional) Create a Slack incoming webhook in the admin
        channel and set SLACK_ADMIN_WEBHOOK_URL in Vercel.
  - [ ] Verify the cron is registered in vercel.json:
        `0 13 * * *` for /api/cron/daily-admin-brief.
  - [ ] Trigger one manual run via curl with CRON_SECRET to confirm
        end-to-end before the first scheduled fire:
        ```
        curl -i -H "Authorization: Bearer $CRON_SECRET" \
          https://fan-engage-pearl.vercel.app/api/cron/daily-admin-brief
        ```
        Expect 200 + a row in admin_briefs.

### Smoke test (when there's enough activity to be meaningful)

Don't bother running until the platform has at least one community
that's posted in both this-week and last-week buckets — otherwise
every brief will say "Quiet week."

When ready:

1. **Manual trigger fires** — curl the cron endpoint with
   CRON_SECRET. 200 response with brief_id + took_ms.
2. **Row persists** — table editor shows the new admin_briefs row
   with non-empty summary + non-empty metrics jsonb.
3. **/admin/briefs renders** — sign in as admin, hit
   /admin/briefs. Latest brief is expanded by default; older ones
   collapsed.
4. **Summary readable** — narrative is plain text, ≤ 80 lines, no
   markdown table garbage. References specific community names
   and concrete numbers.
5. **Anomaly bullet appears** — manually delete a community's
   posts in a test community to force a no_activity anomaly.
   Re-run the cron. Brief shows the anomaly in the heads-up section.
6. **Slack arrives (if configured)** — check the configured admin
   channel. Message body matches the persisted summary.
7. **Slack failure recorded** — temporarily set
   SLACK_ADMIN_WEBHOOK_URL to a malformed URL. Re-run cron. Brief
   still persists; channels_sent is empty; errors[] in the cron
   response includes a Slack failure message.
8. **AI failure soft-falls back** — temporarily unset
   ANTHROPIC_API_KEY. Re-run cron. Brief persists with the
   deterministic non-AI narrative; model column still records the
   intended model.
9. **Empty platform doesn't crash** — drop all active=true on
   communities (don't actually do this — just spot-check the
   gather.ts logic with all-empty community list). Cron should
   produce a "Quiet week" summary, not error out.
10. **Window math correct** — pick a brief, copy its window_end.
    Run gather.ts metrics manually with that windowEnd. Numbers
    should match what's in the persisted metrics jsonb (within
    rounding).

After all 10 pass, briefs are launch-ready.

### V2 paths documented in AI_INFRASTRUCTURE.md

- Email channel via Resend
- IP-block bot detection
- Per-community points attribution (needs points_ledger.community_id)
- Multi-week trend memory in the summarizer prompt
- Per-admin filtering by admin_users.community_id
- Anomaly-only Slack mode

---

---

## 🎯 Stickiness mechanics (Phase 1-7 shipped 2026-05-04)

Seven fan-retention systems shipped end-to-end in one session. Backend + UI all live in production. Migrations applied; all commits green.

### ✅ Shipped

| Phase | Mechanic | Commit | Schema |
|---|---|---|---|
| 1 | Daily streak counter + milestones (7/30/100/365) | `df5eac1` | `fans.{current_streak_days,longest_streak_days,last_active_date,streak_started_at}` + `streak_log` |
| 2 | Web Push + SMS + per-fan preferences | `9de1c46` | `push_subscriptions` + `notification_preferences` + `notification_log` |
| 3 | "Your week" personal recap tile | `f422691` | (no schema — pure compute) |
| 4 | Limited-time drops + countdown + 1h-warning push | `d66a126` | `rewards_catalog.{is_drop,drops_at,expires_at}` + `reward_drop_notifications` |
| 5 | Top fans this month leaderboard | `08212fd` | (no schema — pure compute) |
| 6 | Predictions with admin resolution + correct-guess points | `d6daf46` | `community_posts.{correct_option_id,resolved_at,points_for_correct,prediction_closes_at}` + `prediction_award_log` + enum value `'prediction'` |
| 7 | Fan-artist anniversary moments + daily cron | `91fd351` | `fan_anniversary_log` |

### ⚠️ Manual wire-ups still needed before launch

- [ ] **Phase 4 — Admin form drop fields** — Add the `is_drop` checkbox + `drops_at` / `expires_at` datetime inputs to `frontend/app/admin/rewards/[id]/reward-form.tsx` AND `frontend/app/admin/rewards/new/reward-form.tsx`. Drop-in JSX in `_fe_drops/README.md`. Until this is done, drops can only be flagged via SQL.
- [ ] **Phase 6 — Prediction feed render** — Add a `kind === 'prediction'` branch to the community feed renderer that mounts `<PredictionCard />`. Drop-in 5-line JSX in `_fe_predictions/README.md`. Until this is done, prediction posts render as plain untitled rows.
- [ ] **Phase 2 — Push icon assets** — Add `/public/icon-192.png` (192×192 app icon) + `/public/badge-72.png` (72×72 monochrome badge for Android tray). Without these, browsers fall back to a generic bell on push notifications.

### 📅 Post-launch refinements (deferred, not blocking)

**Phase 1.5 — Streak**
- Point multipliers on actions (2× / 3× while streak active)

**Phase 2.5 — Notifications**
- Event-match push trigger (preference column wired; cron `event-match-prepare` doesn't yet call `sendNotification`)
- iOS Safari support (requires PWA manifest)

**Phase 3.5 — Recap**
- Generated share image (PNG/canvas SSR) for IG Stories
- Calendar-week alignment vs rolling 7-day window (2-line change in `lib/personal-recap/gather.ts`)
- Cached `weekly_recap` table — only if p95 slips
- Year-end "Wrapped" — same gather over 365-day window

**Phase 4.5 — Drops**
- Sold-out detection (skip 1h-warning push if `stock = 0`)
- Drops calendar admin view (listing upcoming/live/expired in one screen)
- Email channel for drops
- Geographic launches (regional drops)

**Phase 5.5 — Leaderboard**
- Materialized view caching (only if `gatherArtistLeaderboard` p95 > 500ms)
- Anonymized rank private mode (opt-in column on `notification_preferences`)
- Cross-month history view ("Top fans of April" admin lookback)
- Permanent founder ribbon for fans who hit #1 three months running

**Phase 6.5 — Predictions**
- Admin queue page listing all unresolved predictions
- Auto-close grace period (5-min late-vote window with warning)
- Prediction-specific notify preference column
- Multi-correct predictions ("pick all that apply")

**Phase 7.5 — Anniversaries**
- AI-personalized anniversary message via `lib/drafts`
- Email channel for anniversaries via Mailchimp
- Anniversary badge in the badges system
- Whole-platform anniversary based on `fans.created_at`
- Anniversary-card UI on Fan Home showing next upcoming milestone with countdown

### ⏸️ Phase 8 — Live listening party / live chat (deferred)

- **Live listening parties** — Supabase Realtime channel + live-chat composer + admin orchestration tools (start session, eject misbehaving fans, bulk push followers with calendar invite, points award for fans who were "present"). Heaviest item on the original ranked list (~5 days dev).
- **Defer trigger:** revisit when ≥3 active artists each have ≥50 followers. Without that audience, no live session has enough humans to feel alive.

### 🔐 New env vars (Phase 2)

| Variable | Purpose | Status |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public VAPID key for browser push subscribe | ✅ set |
| `VAPID_PRIVATE_KEY` | Private VAPID key for server-side push send | ✅ set |
| `VAPID_SUBJECT` | `mailto:kevinjonassr@gmail.com` — sender identity for push services | ✅ set |

### 📊 New cron schedules

- `*/15 * * * *` — `/api/cron/drops-notifier` (Phase 4: drop-launched + 1h-warning pushes)
- `0 14 * * *` — `/api/cron/anniversary-notifier` (Phase 7: daily anniversary scan, 9am Central)

### 🧪 Pre-launch smoke test sequence

To verify all seven phases work end-to-end before opening signups:

1. **Streak** — sign in, refresh Fan Home → streak tile shows "1 day" + "+5 pts."
2. **Push** — click the opt-in banner, allow OS prompt → row in `push_subscriptions`. Have a second account post a comment on one of yours → push lands within ~5s.
3. **Recap** — react to ≥1 post / RSVP ≥1 event / earn any points → "Your week" tile populates with non-zero stats.
4. **Drops** — temporarily flag a reward as `is_drop = true` with `expires_at = now() + 90 min` via SQL → countdown chip renders amber "Ends in 1h 29m" and tics down.
5. **Leaderboard** — accumulate any community activity → mini-card on `/artists/raelynn` and full board at `/artists/raelynn/leaderboard` show the fan ranked.
6. **Predictions** — once feed is wired, create a prediction post via admin → vote as fan → resolve as admin → +N pts hits the ledger and push fires to voters.
7. **Anniversaries** — backdate a `fan_artist_following.followed_at` by 30 days → curl the cron with bearer token → row in `fan_anniversary_log` + +25 pts + push.


---

## ✅ Done

Recorded for the paper trail:

- Phase 1 — Core platform (fan home, rewards, marketplace, referrals, community, invite/QR)
- Phase 2a — Community Hub (polls, challenges, announcements, reactions, comments)
- Phase 2b — Auto-awarded badges + Supabase Storage image uploads
- Phase 2c — Admin dashboard + campaigns + CTAs + moderation + 3-layer security
- Phase 3a — DB-backed artists + editor + per-artist following
- Phase 3b — Event RSVPs + capacity + .ics + per-event campaign audiences
- Phase 3c — Automated 24h + 1h reminders via Vercel Cron
- Phase 3d — Policy pages (DRAFT) + cookie banner + footer + onboarding consent + unsubscribe + Twilio STOP webhook
- Phase 5a — Premium tier gating (community posts visibility, event tier)
- Phase 5b — Stripe subscriptions + founder slots + paid memberships
- Phase 5c — Points multipliers + cancellation policy
- Phase 5d — Premium paywall + body-gate on premium posts
- Phase 5e — Founder-only tier + monthly credits + admin founder roster + analytics
- Phase 6 — Rewards redemption (catalog + RPC + admin queue + fan UI) + Hero image upload + Public Founder Wall
- Phase 7 — Save reliability (useFormSave + retry-on-503 + visible status across primary admin write surfaces)
- Phase 8 — Fan Home discovery polish (top-3 upcoming events from any followed artist regardless of RSVP, Recent Activity kind chips + body fallback so non-titled posts surface, admin events list gained per-row ✏️ Edit with full inline form including active toggle)
- Phase 9 — Signup unblock (migration 0023 — patched legacy `award_badge(uuid, text)` to delegate to `award_community_badge` so the ON CONFLICT target matches the post-0011 3-column PK on `fan_badges`; every signup since 0011 had been silently 500-ing with "Database error saving new user" and rolling back the auth.users insert). Also added a `COLLABORATING.md` onboarding guide for new engineers.

---

## 🧪 Pre-launch QA test plan (from Carla/Manus audit, 2026-05-06)

Run through this end-to-end before flipping the production switch on the next round of artist outreach. Each item should pass with screenshot or short note in the launch QA log.

- [ ] **Build** — `npm run build` completes without errors
- [ ] **Lint/type** — `npm run typecheck` clean
- [ ] **Artist application Step 1** — submit with valid data, confirmation message renders, application appears in `/admin/applications`
- [ ] **Validation** — submit empty required fields; clear inline messages appear without losing entered data
- [ ] **Keyboard navigation** — tab through `/for-artists/apply` end-to-end, focus order logical, no traps
- [ ] **Mobile apply (≤390px wide)** — Submit CTA visible and clickable; cookie banner does not cover it
- [ ] **Metadata** — view-source on `/`, `/for-artists`, `/for-artists/apply`, `/artists` — each title and description is unique
- [ ] **Legal pages** — `/privacy`, `/terms`, `/cookie-policy` either show finalized copy OR a "policy being finalized" holding state with `support@fanengage.app` contact and `noindex` (pending George's legal handoff)
- [ ] **Artist directory alt text** — inspect `/artists` images; meaningful artist images include descriptive alt text
- [ ] **CTA flow** — click "Apply to launch your fan club" on `/for-artists` lands on `/for-artists/apply`
- [ ] **OG previews** — paste each priority URL into Slack or LinkedIn debugger; preview matches page intent (artist acquisition vs fan-side discovery)

## ♿ Accessibility pass — deferred to post-launch

Real but non-blocking gaps surfaced in the Carla/Manus audit:

- [ ] **Artist directory image alt text** — `<img alt="...">` on `/artists` cards should describe the artist, not be empty/decorative
- [ ] **Form error → control linking** — wire `aria-describedby` from helper/error text to inputs on `/for-artists/apply`, `/admin/<slug>/setup`
- [ ] **Required-field affordance** — visible asterisk + screen-reader hint pattern across all `required` inputs
- [ ] **Heading hierarchy audit** — confirm one H1 per page across artist-acquisition and admin routes
- [ ] **Decorative icon `aria-hidden`** — Lucide icons used for visual flourish should be hidden from screen readers
- [ ] **Cookie banner / install prompt focus order** — verify banner is reachable via tab and dismissible via Enter/Space

Form already has `<fieldset>`+`<legend>`, `htmlFor` labels, and basic accessible markup; nothing is critically broken. These are quality-of-platform items, not launch blockers.

## 📝 Form-trim decision pending

Carla/Manus recommended capping the artist application Step 1 at ≤7 fields with an optional Step 2 for qualification details. Current `/for-artists/apply` has 25+ visible fields across 5 sections.

**Decision deferred:** Kevin to confirm whether to ship Step 1/Step 2 split now (conversion lift, ~1 day of work) or hold until after the legal pages land. The application pipeline (F.1.A) and onboarding wizard (G.5) already separate "apply" from "set up your hub" — a Step 1/Step 2 split would just trim the public-facing form length.

## 👤 Public fan profile — deferred items

Migration 0034 + /fans/<handle> route shipped 2026-05-06. The following are deferred to a follow-on bundle:

- [ ] **/me/profile settings page** — let fans customize their handle (currently auto-generated as `firstname-XXXX`) and toggle `public_profile_enabled`. v1 uses the default true and a fan must update DB directly to opt out.
- [ ] **Handle uniqueness conflict UX** — when a fan picks a taken handle in the eventual settings page, surface a clean error + suggestions.
- [ ] **Reserved handle list** — block `admin`, `support`, `api`, `auth`, `rewards`, etc. before opening up custom handle picking.
- [ ] **Friend-of-friend visibility** — surface "Sarah (@sarah-7f3a) just claimed Founder #28 for RaeLynn" in the inbox of fans who follow Sarah.
- [ ] **Activity feed on profile** — chronological feed of public events on the fan's profile (badges earned, founder claims, drops won) the way GitHub profiles surface activity.
- [ ] **Profile share auto-prompt** — when a fan earns their first badge or claims a founder slot, surface a one-time toast: "Your profile is live at fan-engage.com/fans/<handle> — share it?"

## 🔐 OAuth re-enable (gated on G.4)

- [ ] **Configure Supabase custom auth domain** — Supabase Pro setting; e.g. `auth.fanengage.com`. Without this, the Google consent screen shows the raw Supabase project URL, which reads as untrustworthy.
- [ ] **Update Google OAuth client redirect URIs** in Cloud Console to point at the custom auth domain.
- [ ] **Update Apple OAuth Service ID redirect** to match (if/when Apple SSO is wired up; currently deferred per `reference_google_oauth.md` memory).
- [ ] **Submit Google OAuth consent screen for verification** so 'Fan Engage' appears prominently instead of the redirect host. (Optional but recommended.)
- [ ] **Restore OAuth buttons in `frontend/app/signup/signup-form.tsx`** — git history has the original block at the commit before this gate landed. Revert that commit's hunk to bring them back.

Until all of the above are done, signup is email-only. The OAuth buttons are commented out with a self-documenting block in signup-form.tsx.

## 🔧 Handle / socials refactor

The previous `fans.handle` column was overloaded — the onboarding wizard wrote a TikTok/Instagram handle to it AND the public profile feature used it as a URL slug. Migration 0035 splits the two:

- **`fans.socials`** (jsonb) — social handles. Onboarding's "TikTok or Instagram handle" field now lands at `socials.instagram_or_tiktok`.
- **`fans.profile_slug`** (text) — URL slug for `/fans/<slug>`. Trigger generates `firstname-XXXX` on insert.
- **`fans.handle`** (legacy) — kept as a deprecated column. Values that looked like social handles (started with `@` or had non-slug characters) were moved to socials and the source nulled. Drop after the next clean release.

**Run**: `frontend/supabase/migrations/0035_socials_and_profile_slug.sql` in FE Supabase project `uhovonrljcauaoctypbg`.
**Verify**: `select count(*) filter (where profile_slug is null), count(*) from public.fans;` → expect (0, total).

## 🪶 Post-launch polish — May 6 sprint smoke test

Two cosmetic / structural items surfaced during the prod smoke pass after the handle/socials refactor + Bundle 4 deploys. Neither is blocking.

### 1. Page-title doubling (`X · Fan Engage · Fan Engage`)

Every page that supplies a `title` in its `metadata` block currently renders as `"<Page> · Fan Engage · Fan Engage"` in the browser tab. Cause: `app/layout.tsx` exports a `metadata.title.template` like `"%s · Fan Engage"` and the page-level metadata strings also already include `· Fan Engage`. Next.js applies the template to whatever the page returns, so the suffix gets appended twice.

**Fix options (pick one):**
- (a) Remove the trailing `· Fan Engage` from every page-level `title` string and let the layout template add it. Cleanest, requires touching: `/for-artists`, `/for-artists/apply`, `/artists`, `/fans/[slug]`, `/members/[slug]` siblings, `/share/founder/[slug]/[number]`, etc.
- (b) Drop the `template` from layout and let each page own its full title. Less coupling but more boilerplate per page.

**Where:** `frontend/app/layout.tsx` + each page-level `metadata.title`.

### 2. Migration broader-update would re-leak socials on a fresh DB

When migration `0035_socials_and_profile_slug.sql` ran in FE Supabase, the conservative `where (handle ~ '[^a-z0-9-]' or handle ~ '^@')` filter only caught 1 of 8 fans (the one with `@`-prefixed Instagram). I followed up with a broader `where handle is not null` update to move the rest. That broader update was correct in production *because* the source values were the onboarding wizard's social-handle inputs — but the same logic applied to a fresh DB where `handle` already holds the auto-generated slugs from `0034`'s backfill would incorrectly stuff slugs into `socials.instagram_or_tiktok`.

The leak was caught and cleaned in FE prod with:
```sql
update public.fans
  set socials = socials - 'instagram_or_tiktok'
where socials->>'instagram_or_tiktok' = profile_slug;
```
…which preserves real social handles (`countrycarlamoore`, `@raymondboyd`, `mauten85`) and strips the auto-generated `kevin-bf02`-style values.

**Hardening for future re-runs:**
- Update `0035` (and BEP's `0033`) source files to NOT include the broader cleanup step. Keep only the conservative regex. Document the post-migration cleanup as a manual step run only when the source population is confirmed to be from an onboarding social-handle field.
- Add the discriminator query above as a verification step in the migration comments so anyone re-running can confirm before/after.

## ⚖️ Manus audit — legal interim + apply form simplification (May 6)

### Legal pages — interim safe-holding state

While George's corporate-counsel docs are still in flight, the four legal routes (`/privacy`, `/terms`, `/cookie-policy`, `/legal`) carry a production-safe holding state instead of the original "DRAFT — pending legal review / use at your own risk" banner. Each route also has `robots: { index: false, follow: false }` so search engines don't index the holding copy.

**When George's docs land:**
1. Replace `policies.content_md` with the final text (Supabase Table editor or SQL).
2. Set `policies.is_draft = false` for that slug.
3. Optionally remove the `robots: { index: false, follow: false }` from the route's `metadata` export (or leave it — nothing breaks if it stays during the rollout window).

The /legal hub's "DRAFT" pill was also softened to "Being finalized" — same flip when policies go live: drop the holding-state branch in `policy-page.tsx` (or leave it; it's a no-op once `is_draft = false`).

### Apply form — simplified Step 1

`/for-artists/apply` reduced from 5 sections / 20+ visible fields to a single Step 1 with 7 fields:

1. Artist or band name (required)
2. Your name (required)
3. Email (required)
4. Primary genre (required, single-select dropdown)
5. Primary music or social link (required, URL)
6. Launch timing (required, dropdown — ASAP / 30d / 60d / 90+d / exploring)
7. What are you hoping to build? (optional, 500-char textarea)

Detailed onboarding fields (slug, bio, tagline, full social pack, manager info, monthly listeners, tour dates, founder tier interest, distribution platform) move to the existing `/admin/<slug>/setup` wizard which runs after acceptance. No DB migration needed — the new minimal form maps to existing `applications` columns:

- primary_genre → `genres[]` (single-element array)
- primary_link → `social[]` (`[{label: 'Primary', href}]`)
- launch_timing → `expected_launch_date` (free-form text)
- goals_note → `community_pitch`

### Manus items still pending (deferred)

- **Accessibility pass** (P1) — fieldset/legend on radio groups, aria-describedby on errors, alt text on artist directory cards. Not landed in this commit.
- **PWA install prompt timing** (P2) — delay until after submit / after sign-in / after repeat visit.
- **Mirror to BEP** — `/for-brands/apply` has the same long-form problem; mirror when ready.

