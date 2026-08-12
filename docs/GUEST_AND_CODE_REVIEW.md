# Fan Engage Pro — Soft-Launch Guest & Code Review

**Repo:** `JonasGroupEntertainment/fan-engage`  
**Production:** https://fanengagepro.com  
**Reviewed at:** `3022e389` (merge of PR #7 — password primary, Turnstile on magic-link / signup / forgot only)  
**Scope:** Soft launch for first-time fans (RaeLynn). No OAuth re-enable. No large refactors. Findings verified against this repo (not invented metrics).

### Product framing (binding)

**Fan Engage Pro is a SUPERFAN site for artist–fan relationships** — artists, fans, drops, backstage access, tour moments, rewards, and community. All guest-flow and copy review in this document uses that frame.

This is **not** Brand Engage Pro (BEP). Do not evaluate or rewrite guest UX as a brand/loyalty/restaurant/retail product. Sister-product notes elsewhere in the repo (`docs/CONTEXT_HANDOFF.md`, launch plan) do not apply to soft-launch guest copy or journey language here.

Guest-facing language should read as: join an artist’s fan experience → earn points → unlock drops / backstage / rewards — not “members of a brand program.”

---

## Verdict

**Conditional soft launch — not a hard “go” until the P0 payment/entitlement holes and the guest onboarding skip are closed.**

Auth UX after PR #7 is coherent for returning fans (password primary, magic-link secondary, OAuth gated). The soft-launch risk is concentrated in: (1) Stripe webhook idempotency that can permanently drop premium unlocks, (2) RLS/RPC holes that let clients self-grant premium or spend another fan’s points, and (3) signup paths that skip onboarding and the promised first 100 points (the first SUPERFAN moment).

---

## Guest journey map (actual routes)

Frame: first-time fan joins an **artist** SUPERFAN experience (not a brand loyalty signup).

Soft-launch entry (docs): `/signup?ref=raelynn` — see `docs/RAELYNN_PRELAUNCH_CHECKLIST.md`.

| Step | Route | Key files |
|------|-------|-----------|
| Land (artist) | `/artists/[slug]` | `frontend/app/artists/[slug]/page.tsx` |
| Land (home) | `/` | `frontend/app/page.tsx`, `frontend/components/signed-out-landing.tsx` |
| Invite / ref | `/invite/[code]` | `frontend/app/invite/[code]/page.tsx`, `set-ref-cookie.tsx` |
| Header Join | `/signup?ref=raelynn` | `frontend/app/layout.tsx`, `frontend/components/mobile-nav.tsx` |
| Signup | `/signup` | `frontend/app/signup/page.tsx`, `signup-form.tsx` |
| Email confirm | `/auth/callback?code&next=` (`/?code=` forwards) | `frontend/app/auth/callback/route.ts`, `frontend/app/page.tsx` |
| Onboarding | `/onboarding` | `frontend/app/onboarding/page.tsx` → `POST /api/fan-engage/onboard` |
| First points / welcome | `/artists/[slug]?welcome=1` or `/onboarding/mission` | `welcome-quest.tsx`, `onboarding/mission/page.tsx` |
| Login | `/login` | `frontend/app/login/page.tsx` |
| Forgot / reset | `/forgot-password`, `/reset-password` | matching `page.tsx` files |
| Home / community / rewards | `/`, `/community` → artist community, `/rewards`, `/artists/[slug]/rewards` | `community/route.ts`, rewards pages |

**Happy path that preserves bonus + artist context:**  
`/artists/raelynn` → Join → `/signup?ref=raelynn` → confirm → `/onboarding?ref=raelynn` → Finish → `/artists/raelynn?welcome=1` (+100 pts via onboard API).

---

## Auth UX coherence (post-PR #7 / `3022e389`)

| Door | Status | Notes |
|------|--------|--------|
| Password login | Primary | No Turnstile; clear “Welcome back” copy — prefer this in CS macros |
| Magic link | Secondary | Turnstile + 45s cooldown; “newest link wins” / PKCE overwrite — support load (B-P1-0) |
| Signup | Email + password | Turnstile + consent modal; OAuth **commented out** (correct — do not re-enable) |
| Forgot / reset | Working shape | Turnstile on forgot; reset page lacks session/expired-link UX |
| OAuth | Gated | Blocked until custom auth domain (`LAUNCH_CHECKLIST` G.4); needs guest-facing “coming soon” line (B-P1-0b) |

### Guide (CS) full logged-out production walk (fanengagepro.com)

Severity table mapping Guide’s walk → review IDs. Product frame: **artist↔fan SUPERFAN** (not Brand Engage).

| # | Guide finding | Sev | ID | Paths / notes | Fix PR |
|---|---------------|-----|----|---------------|--------|
| 1 | Magic-link **SECURITY CHECK blank**; button stuck “Complete security check…”; password OK | **P0** | B-P0-5 | `turnstile-widget.tsx`, `login/page.tsx` — configured key + silent load/render failure → infinite disabled | **#11** |
| 2 | Homepage “Create your fan profile →” → `/onboarding` paints wizard then → `/signup?next=/onboarding` | **P0** | B-P0-4 | `signed-out-landing.tsx`, `onboarding/page.tsx` | **#11** (CTA + interstitial) |
| 3 | `/premium` RaeLynn-only feel + contradictory counters (“97 spots remaining of 100” vs “3 / 100 claimed”) | **P1** | B-P1-13 | `premium/page.tsx` banner + `founder-slots-counter.tsx` — math matches (3 claimed ⇒ 97 left) but **dual copy looks contradictory**; soft-launch is single-artist | open |
| 4 | Literal `don&apos;t` on `/marketplace` | **P1** | B-P1-0c | JS string in preview bullets only (unsubscribe/billing/share JSX `&apos;` decode OK) | **#10 / #11** |
| 5 | OAuth hidden — document for CS, **do not re-enable** | **P1** | B-P1-0b | signup/login — no guest “coming soon” on main | **#9 / #11** copy |
| 6 | Nav **Community** silently → `/artists/raelynn/community` | **P1** | B-P1-14 | `layout.tsx` → `/community` → `community/route.ts` + `getSoleActiveArtistSlug()` | open — label “RaeLynn community” or chooser copy |
| 7 | Horizontal overflow / clipped avatar @ 1280 | **P2** | B-P2-8 | layout/header avatar cluster | open |
| 8 | “1 ACTIVE ARTISTS” grammar | **P2** | B-P2-9 | `signed-out-landing.tsx` ProofTile always plural | **#11** singular when 1 |
| 9 | Forgot-password Turnstile vs PR #7 intent | **P2** | B-P2-10 | `forgot-password/page.tsx` **has** Turnstile — matches PR #7 (Turnstile on magic-link/signup/**forgot**, not password) | verify only |
| 10 | Cookie banner covering hero | **P2** | B-P2-11 | `cookie-banner.tsx` fixed bottom on `/` | open — delay/position or hero padding |

Earlier Guide themes still in force: invite credit after Accept (**B-P0-3**), magic-link PKCE support load (**B-P1-0**).

### CS reply stories (support ↔ engineering)

Use these verbatim (or close) when fans hit the issues below. Engineering fixes in **#11** / follow-ups must match what support promises.

#### 1) Magic-link button greyed / Security check blank

**Tell the fan:**
> Sign in with your **email and password** instead — that’s the main door. If you don’t remember it, use **Forgot password?** on the sign-in page and set a new one. The “Email me a magic link” path needs a security check that sometimes doesn’t load; that’s a bug we’re fixing. You haven’t lost your account.

**Eng match:** B-P0-5 / **#11** — never leave blank infinite-disabled Turnstile; Retry + steer to password. Do **not** tell fans to wait on magic-link as the primary unblock.

#### 2) Onboarding page flashed then sent them to signup

**Tell the fan:**
> Nothing’s lost. Creating your **fan account** comes first; then you’ll finish your **profile** (name, interests, etc.) and land in the artist experience with your signup points. Tap **Create account**, confirm your email, and continue — we’ll take you through profile next.

**Eng match:** B-P0-4 / **#11** — homepage CTAs go to signup; `/onboarding` shows “Create your fan account first” interstitial (no wizard flash). Do **not** imply they broke something or skipped a step forever.

#### 3) Premium / Founding Fan spots look wrong or “only RaeLynn”

**Tell the fan:**
> Soft launch Premium and Founding Fan pricing are for **RaeLynn’s** fan experience right now. If you see both “spots remaining” and “X / 100 claimed,” that’s the **same number shown two ways** — a display bug that can look conflicting. The real count is how many Founding Fan spots are claimed out of 100; remaining = 100 − claimed. We’re cleaning up the copy so it’s one clear counter.

**Eng match:** B-P1-13 — unify to one counter; add soft-launch “RaeLynn’s fan experience” framing. Do **not** invent a second waitlist or say spots are sold out unless `remaining === 0`.

---

## A) Code / engineering findings

### P0 — fix before paid / soft-launch traffic

#### A-P0-1. Stripe webhook marks failed events as processed (retries become no-ops)
- **Paths:** `frontend/app/api/stripe/webhook/route.ts` (~62–138)
- **Why:** On handler failure the route still writes `processed_at`, returns 500 for Stripe retry, then on retry hits `if (existing?.processed_at) return { replay: true }` and **never re-runs** the handler. A transient DB/RPC error leaves a paying fan on `free`.
- **Fix:** Only set `processed_at` on success. On failure leave `processed_at` null (keep `error`), or clear it when returning 500. Treat “error set + not successfully processed” as retryable.

#### A-P0-2. `redeem_reward` SECURITY DEFINER has no `auth.uid()` check (IDOR)
- **Paths:** `supabase/migrations/0021_rewards_redemption.sql`; callers `frontend/lib/data/rewards.ts`, `frontend/app/artists/[slug]/rewards/actions.ts`
- **Why:** RPC takes arbitrary `p_fan_id`. App action passes the caller’s id, but any client with the anon key can call the RPC and spend another fan’s points / create redemptions. No revoke-from-anon in migrations.
- **Fix:** At start of function: `if auth.uid() is distinct from p_fan_id then raise …`. Optionally `revoke execute … from anon`; grant only `authenticated`. Ship as a new migration (do not edit applied 0021 in place on prod without a follow-up migration).

#### A-P0-3. Fans can UPDATE own membership rows without column restriction (premium self-grant)
- **Path:** `supabase/migrations/0011_multi_tenant.sql` (`memberships_own_update`)
- **Why:** Policy is `auth.uid() = fan_id` with no column narrowing. Authenticated clients can likely set `subscription_tier` to `premium`/`comped`, `is_founder`, credits, etc., bypassing Stripe.
- **Fix:** Drop broad update policy; allow only safe leave/status changes via a SECURITY DEFINER RPC, or column privileges / trigger that rejects billing-field changes unless `auth.role() = 'service_role'`.

### P1 — high risk for guests, admins, or launch ops

#### A-P1-1. Twilio inbound signature verification fails open if token missing
- **Path:** `frontend/app/api/twilio/inbound/route.ts` (~57–68)
- **Why:** Verification only runs `if (twilioAuthToken)`. Missing env = forgeable STOP/START. Also loads all `fans` phones into memory to match.
- **Fix:** Fail closed (403) when `TWILIO_AUTH_TOKEN` unset in production. Query by normalized phone / E.164 index.

#### A-P1-2. Twilio URL depends on `NEXT_PUBLIC_APP_URL`; `.env.example` omits it
- **Paths:** Twilio route; `frontend/lib/app-url.ts`; `frontend/.env.example`
- **Why:** Signature check uses exact webhook URL. Wrong/missing app URL → all Twilio posts 403 (compliance breakage) or wrong host. Checklist still flags APP_URL hygiene.
- **Fix:** Document and require `NEXT_PUBLIC_APP_URL` in `.env.example`; align Twilio console URL with `https://fanengagepro.com`.

#### A-P1-3. Broken admin RLS on `reward_redemptions`
- **Path:** `supabase/migrations/0021_rewards_redemption.sql` (admin policy uses `is_admin = true` on `fan_community_memberships`)
- **Why:** No `is_admin` column on memberships; admins live in `admin_users` / `is_admin_of()`. Policy is dead. App uses service role today, so UI may work while RLS story is wrong.
- **Fix:** `using (public.is_admin_of(community_id))` in a new migration.

#### A-P1-4. Founder-only reward gate checks wrong field
- **Path:** `supabase/migrations/0021_rewards_redemption.sql` (`subscription_tier != 'founder'`)
- **Why:** Tier enum is `free|premium|past_due|cancelled|comped`; founder is `is_founder` boolean (`0013`). Founder-only catalog rows (seeded in `0048`) never unlock correctly.
- **Fix:** Gate on `v_membership.is_founder` (and premium on premium/comped as elsewhere).

#### A-P1-5. Admin server actions check “any admin,” not community scope
- **Paths:** e.g. `frontend/app/admin/offers/actions.ts`, `frontend/app/admin/influencers/actions.ts`, `frontend/app/api/admin/import-fans/route.ts`
- **Why:** `getAdminUser()` only. Artist-scoped admin can mutate other communities’ data via service role.
- **Fix:** Require `getAdminContext()` + `isSuperAdmin || communities.includes(target)` on every write.

#### A-P1-6. Password login has no app-level bot/rate protection
- **Paths:** `frontend/app/login/page.tsx`; Turnstile only on magic-link/signup/forgot (`3022e389` intentional)
- **Why:** Credential stuffing hits Supabase from the browser; in-memory limits only cover turnstile verify + callback.
- **Fix:** Confirm Supabase Auth rate limits; CAPTCHA after N failures or edge rate limit; monitor auth logs. Do **not** put Turnstile on the primary password door by default (keeps soft-launch UX clear).

#### A-P1-7. Turnstile client fail-open can override server fail-closed
- **Path:** `frontend/components/turnstile-widget.tsx` (`verifyTurnstileToken`, ~147–154)
- **Why:** Even if `TURNSTILE_FAIL_OPEN=false`, client treats `upstream_error`/`network_error` as success.
- **Fix:** Honor server JSON; only fail-open when server returns `failedOpen: true` (or keys unset).

#### A-P1-8. Cron / leaderboard not scheduled
- **Paths:** `frontend/vercel.json` vs `frontend/app/api/cron/leaderboard-notifications/route.ts`
- **Why:** `verifyCronAuth` pattern is solid (fail-closed), but leaderboard notifications cron is **not** in `vercel.json`.
- **Fix:** Add cron entry or document intentional manual-only.

#### A-P1-9. Env / migration drift & thin CI
- **Paths:** `supabase/migrations/*` (00xx + timestamp dual naming); stale `frontend/supabase/migrations/` (0034–0038 only); `.env.example` missing `CRON_SECRET`, `STRIPE_*`, `ADMIN_*`, `NEXT_PUBLIC_APP_URL`; `.github/workflows/secret-scan.yml` only
- **Why:** History of out-of-band applies; incomplete env template; no typecheck/lint/test gate.
- **Fix:** Treat root `supabase/migrations` as sole source; complete `.env.example`; add frontend `tsc`/lint on PR.

### P2 — completeness / hygiene

#### A-P2-1. Stripe Connect open PR is stale vs current MoR direction
- **Open PR:** [#1](https://github.com/JonasGroupEntertainment/fan-engage/pull/1) `feat/stripe-connect-foundation`
- **Live code:** Connect onboarding retired (`frontend/app/admin/stripe/connect/actions.ts`); payout cron returns `retired: true`
- **Why:** Merging #1 would reintroduce a contradictory Connect foundation against MoR + manual payout reporting.
- **Fix:** **Close #1** (or rewrite against current MoR) before launch clutter. Soft launch does not need Connect.

#### A-P2-2. Superfan Radar WIP PR
- **Open PR:** [#4](https://github.com/JonasGroupEntertainment/fan-engage/pull/4)
- **Why:** Admin feature + large binary videos; not guest-path. Do not merge into soft-launch critical path.

#### A-P2-3. Dependabot js-yaml
- **Open PR:** [#6](https://github.com/JonasGroupEntertainment/fan-engage/pull/6)
- **Why:** DevDependency security bump — safe to merge; not launch-blocking.

#### A-P2-4. Network RPCs / unmatched events surface
- **Paths:** timestamped `network_*` migrations; `0029_event_match.sql` (`list_unmatched_events` granted to anon)
- **Why:** Checklist already flags possible wrong-project network layer. Low guest impact; revoke unnecessary anon grants when convenient.

#### A-P2-5. In-memory rate limiter is per-instance
- **Path:** `frontend/lib/rate-limit.ts`
- **Why:** Soft control on Vercel multi-instance. Acceptable for soft launch.

### Payments / premium / Stripe Connect completeness (soft launch)

| Area | Status in code |
|------|----------------|
| Checkout | `frontend/app/premium/actions.ts` — session + metadata; unsigned → signup |
| Webhook | Signature + idempotency present; **P0 retry bug** (A-P0-1) |
| Connect Express | Retired; MoR + manual artist payout reporting |
| Portal | `frontend/app/account/billing/actions.ts` |
| Founder race | Advisory pick at checkout, atomic `claim_founder_slot` at webhook |
| Seed | `/admin/stripe/seed` + `/api/admin/stripe-seed` |
| Soft-launch blocker | Fix A-P0-1 + A-P0-3 before paid traffic; confirm live prices seeded per active community |

---

## B) Guest end-user flow & experience findings

### P0 — blocks conversion or first-reward promise

#### B-P0-1. `?next=` can skip onboarding (and the 100-pt bonus)
- **Paths:** `frontend/app/signup/signup-form.tsx` (`onboardingHref = next ?? …`); callers include `preview-signup-banner.tsx` (`nextPath=/rewards|/referrals|/marketplace`), community CTA (`next=/artists/[slug]/community`)
- **Why:** Confirm lands on destination without profile/onboard. Marketing still promises first points (“100 fan points”), but bonus only runs in `api/fan-engage/onboard`.
- **Fix:** Always complete `/onboarding?ref=…` first; treat `next` as post-onboarding return only.

#### B-P0-2. Email confirm may drop `next` → home, not onboarding
- **Paths:** `frontend/app/page.tsx` forwards `?code=` with default `next=/`; `auth/callback/route.ts` defaults `next` to `/`
- **Why:** If Supabase email templates use Site URL without the signup `emailRedirectTo` query, guests confirm and land signed-in with no onboarding / no signup bonus.
- **Fix:** Lock Supabase email template / Site URL to ConfirmationURL → `/auth/callback`; default confirm `next` to `/onboarding` when profile incomplete (middleware or callback check).

#### B-P0-3. Invite credit only after cookie Accept (Guide CS theme)
- **Paths:** `frontend/app/invite/[code]/set-ref-cookie.tsx`; `frontend/components/cookie-banner.tsx` (`HIDE_ON` includes `/signup`); invite CTA → `/signup` without carrying invite code (main, pre-#9)
- **Why (Guide):** Soft-launch influencers/fans share `/invite/[code]`. Guests who tap Create account without Accept never get `fanengage_ref` — inviter credit silently fails. Signup hides the banner, so there’s often no second chance to Accept.
- **Fix:** (a) Show Accept on invite and on `/signup?invite=…`; (b) carry `invite=` on the signup CTA; (c) write `fanengage_ref` after Accept on signup; or treat invite attribution as essential with clear Cookie Policy copy. **Partial fix in #9.**

#### B-P0-4. `/onboarding` paints the wizard then silently bounces to `/signup` (Guide CS — production)
- **Paths:** `frontend/app/onboarding/page.tsx`; homepage CTAs in `frontend/components/signed-out-landing.tsx`; also `frontend/app/onboarding/mission/page.tsx`
- **Verified in code + Guide walk:** Client wizard mounts immediately; `getUser()` then `router.replace(/signup?…)`. Homepage primary CTA linked to `/onboarding`, so first-timers see a fake join wizard then a yank to signup.
- **Why it hurts SUPERFAN guests:** Feels broken (“the join flow crashed”), not “create an account first.”
- **CS reply:** Nothing lost — create account first, then profile (see **CS reply stories §2**).
- **Fix:** (1) Homepage CTA → `/signup?ref=raelynn&next=/onboarding`. (2) Do **not** render the wizard until auth is resolved — signed-out interstitial “Create your fan account first.” **Shipped in #11.**

#### B-P0-5. Magic-link Turnstile Security check blank / infinite disabled (Guide CS — production)
- **Paths:** `frontend/components/turnstile-widget.tsx`; `frontend/app/login/page.tsx`
- **Verified:** Production `/login` shows “Security check” label + empty area; magic-link button stuck on “Complete security check for magic link.” Password path works (no Turnstile). Root causes in widget: silent script/render failure, no timeout, no Retry UI, `isTurnstileConfigured()` still true so the button stays disabled over blank space. CSP already allows `challenges.cloudflare.com` (`next.config.ts`); also verify Cloudflare Turnstile hostname allowlist includes `fanengagepro.com`.
- **Why:** Soft-launch returning fans who prefer magic-link hit a dead secondary door; CS can’t unblock without “use password.”
- **CS reply:** Use password / Forgot password; blank Turnstile is a bug we’re fixing (see **CS reply stories §1**).
- **Fix:** Visible loading + error + Retry; never leave blank infinite-disabled; button copy steers to password when unavailable; explicit Turnstile render. **Shipped in #11.** Keep password primary; do not Turnstile the password door.

### P1 — soft-launch friction / trust / mobile

#### B-P1-0. Magic-link path: Turnstile + PKCE support load (Guide CS theme)
- **Paths:** `frontend/app/login/page.tsx`; `frontend/components/turnstile-widget.tsx`; `frontend/app/auth/callback/route.ts`
- **Why (Guide):** Even when the widget loads, fans must complete Turnstile; each resend invalidates the prior PKCE link (“newest link wins”) → “link doesn’t work” tickets.
- **Fix:** Prefer password in CS macros; surface cooldown + newest-link copy; loading/error UI from B-P0-5. Do not put Turnstile on the password door.

#### B-P1-0b. OAuth hidden with no guest-facing explanation (Guide CS theme)
- **Paths:** `frontend/app/signup/signup-form.tsx` (OAuth block commented out until custom auth domain / G.4); login has no Google/Apple either
- **Why (Guide):** Soft-launch fans expect “Continue with Google.” Buttons are gone with **no** “Email signup only for now” line — looks incomplete or broken, not intentional.
- **Fix:** One calm line under the signup/login email forms: “Google & Apple sign-in coming soon — create your fan account with email for now.” **Do not re-enable OAuth** until custom auth domain.

#### B-P1-0c. Literal `don&apos;t` on marketplace preview (Guide CS — production)
- **Path:** `frontend/app/marketplace/page.tsx` (PreviewSignupBanner `bullets` array) → rendered by `frontend/components/preview-signup-banner.tsx` as `{b}` text
- **Why:** HTML entity `&apos;` inside a **JS string** (not JSX text). React does not decode it. Repo scan: only marketplace guest path had this pattern; unsubscribe/billing/share/drop/admin setup use JSX `&apos;` which renders correctly as `'`.
- **Fix:** Real apostrophe in JS strings. **#10 / #11.**

#### B-P1-13. `/premium` dual founder counters look contradictory (Guide walk)
- **Paths:** `frontend/app/premium/page.tsx` (“N spots remaining of 100”) + `frontend/app/premium/founder-slots-counter.tsx` (“X / 100 claimed”)
- **Why:** For filled=3, remaining=97 both are true, but guests read them as two disagreeing systems. Soft-launch also feels RaeLynn-only (correct for single active artist) without saying so.
- **CS reply:** RaeLynn-specific soft launch; dual counters are a display bug — remaining = 100 − claimed (see **CS reply stories §3**).
- **Fix:** One counter source of truth (prefer “3 of 100 Founding Fan spots claimed · 97 left”); short line “Premium for RaeLynn’s fan experience” when sole active artist.

#### B-P1-14. Nav Community silently lands on RaeLynn (Guide walk)
- **Paths:** `frontend/app/layout.tsx` (`href: "/community"`); `frontend/app/community/route.ts` → `getPrimaryCommunityId()` / `getSoleActiveArtistSlug()` in `frontend/lib/data/fan.ts`
- **Why:** Logged-out guests tap Community and appear inside RaeLynn with no chooser/copy — feels like a bug or hard-coded trap.
- **Fix:** Soft-launch: nav label “RaeLynn” / “RaeLynn community”, or interstitial “Continue to RaeLynn’s community” before redirect.

#### B-P1-1. Onboarding reads like an internal admin tool
- **Path:** `frontend/app/onboarding/page.tsx` — “Capture the basics…”, “Experience preview”, “Launch checklist”, “Fan is live in the journey”, Twilio/Mailchimp error copy
- **Why:** First-time fans feel like they’re in a demo/ops screen, not joining an artist’s SUPERFAN experience (profile → interests → drops/rewards access).
- **Fix:** Fan-facing titles/hints (artist, points, drops, backstage); hide SMS debug panel; plain “Couldn’t send text — try again.”

#### B-P1-2. Last-step SMS “or” path traps
- **Path:** same file — “Send confirmation text” calls onboard early; Finish also onboards; phone forces SMS consent
- **Why:** Two endings; unclear which awards points; easy to think SMS is required.
- **Fix:** One Finish path; optional phone + consent; no separate “complete via SMS.”

#### B-P1-3. Double legal consent
- **Paths:** `frontend/components/consent-modal.tsx` at signup + ToS checkbox again on onboarding last step
- **Why:** Extra friction after already scrolling ToS.
- **Fix:** Capture once at signup; onboarding should not re-gate ToS for the same version.

#### B-P1-4. Cookie banner covers CTAs on auth-adjacent pages
- **Path:** `frontend/components/cookie-banner.tsx` — `HIDE_ON` = apply/signup/login only
- **Why:** Same mobile cover issue already fixed for signup still hits `/forgot-password`, `/reset-password`, `/onboarding`, `/invite`.
- **Fix:** Expand hide list (or reserve bottom padding / non-overlapping placement).

#### B-P1-5. Cookie + install prompts share the same bottom slot
- **Paths:** `cookie-banner.tsx` `z-50`, `install-prompt.tsx` `z-40`, both `fixed … bottom-4`
- **Why:** Stacking / covering primary actions after first engagement.
- **Fix:** Single bottom-sheet slot; never show install until cookie dismissed.

#### B-P1-6. No sticky mobile Join CTA on artist hub
- **Path:** `frontend/app/artists/[slug]/page.tsx`
- **Why:** On mobile, Join scrolls away; cookie/footer compete at bottom.
- **Fix:** Sticky “Join · 100 pts” for signed-out visitors.

#### B-P1-7. Premium paywall for signed-out → Sign in only
- **Path:** `frontend/components/premium-paywall.tsx`
- **Why:** Soft-launch guests hit gated content and get login, not signup.
- **Fix:** Primary “Create account”, secondary “Sign in”, preserve `next` / community.

#### B-P1-8. Artist rewards forces login, not signup
- **Path:** `frontend/app/artists/[slug]/rewards/page.tsx` `redirect(/login?next=…)`
- **Why:** New fans following a rewards link hit the returning-fan door (while `/rewards` marketing preview correctly uses signup banner).
- **Fix:** Redirect to signup with `ref` + `next`, or login page with clear Create account (prefer signup for soft launch).

#### B-P1-9. Reset password has no session / empty state
- **Path:** `frontend/app/reset-password/page.tsx`
- **Why:** Expired/opened-without-session link → opaque `updateUser` failure.
- **Fix:** On mount `getSession()` / `getUser()`; if missing, “Link expired — request a new reset” + CTA to `/forgot-password`.

#### B-P1-10. Landing / deep links still send guests into `/onboarding` (feeds B-P0-4)
- **Paths:** `frontend/components/signed-out-landing.tsx` → `/onboarding` (main); any shared `/onboarding` or `/onboarding/mission` URL
- **Why:** Documented soft-launch entry is `/signup?ref=raelynn`. Landing (and bookmarks) that hit `/onboarding` first trigger the wizard-flash bounce (B-P0-4).
- **Fix:** Soft-launch CTAs → `/signup?ref=raelynn`. Keep `/onboarding` as post-auth only; signed-out hits get the interstitial from B-P0-4. **Landing CTA fix in #9.**

#### B-P1-11. Legal / rewards terms may still be holding states
- **Paths:** `(legal)/policy-page.tsx`; consent modal via `getPolicy`
- **Why:** Guests asked to accept policies that say “being finalized” / rewards terms “will apply once published” undermine trust.
- **Fix:** Soft-launch only with published terms, or don’t gate signup on unfinished docs.

#### B-P1-12. Empty upcoming / merch on artist page
- **Path:** `frontend/app/artists/[slug]/page.tsx` (events/merch sections)
- **Why:** Blank “Upcoming” / rewards sections look broken.
- **Fix:** Fan-facing empty states (“Tour dates coming soon”).

### P2 — confusing copy, empty states, dead ends

#### B-P2-1. “Member” / brand-program language on guest surfaces
- Landing / referrals / marketplace empty states still use “members” in places; prelaunch checklist asks for **fan** language.
- **Why it hurts:** Soft-launch guests should feel they’re joining an artist’s SUPERFAN circle (drops, backstage, rewards) — not a generic membership club or Brand Engage–style loyalty program.
- **Fix:** Prefer fan / Founding Fan / artist-community wording on public surfaces; reserve “member” for internal schema (`fan_community_memberships`) only.

#### B-P2-8. Horizontal overflow / clipped avatar @ ~1280 (Guide walk)
- **Why:** Header/nav avatar or proof row clips on mid-width desktops.
- **Fix:** Audit `layout.tsx` header flex; allow wrap / shrink avatar; test 1280×800.

#### B-P2-9. “1 ACTIVE ARTISTS” grammar (Guide walk)
- **Path:** `frontend/components/signed-out-landing.tsx` ProofTile label always “Active artists”
- **Fix:** Singular when count === 1. **#11.**

#### B-P2-10. Forgot-password Turnstile vs PR #7 intent (Guide walk)
- **Path:** `frontend/app/forgot-password/page.tsx`
- **Status:** Turnstile **is present** — matches PR #7 / `3022e389` (Turnstile on signup, magic-link, **forgot**; password door captcha-free). No change required; document for CS.

#### B-P2-11. Cookie banner covering hero (Guide walk)
- **Path:** `frontend/components/cookie-banner.tsx` fixed bottom on `/`
- **Why:** Accept chip overlaps hero CTA on mobile/short viewports.
- **Fix:** Extra bottom padding on hero while banner shown, or non-overlapping placement.

#### B-P2-2. Dev-facing empty copy on artist page
- “Hero imagery pending Box asset drop.” / “Social links pending.”

#### B-P2-3. Mission invite step never completes
- `frontend/app/onboarding/mission/page.tsx` — invite never sets `done`; sequential locks trap the path.

#### B-P2-4. Home “View Missions” → `/rewards`
- Label doesn’t match destination.

#### B-P2-5. Marketplace empty “Get notified” → `/me/notifications`
- Guests bounce to login for a notify CTA.

#### B-P2-6. Legal “Trust Center” is a dead `#` CTA
- `frontend/app/legal/page.tsx` — “Coming soon”; not core fan path.

#### B-P2-7. Stats fallback can show founding “0 days”
- `frontend/lib/landing-stats.ts` — if stats fail, countdown can resurface closed window (checklist risk).

---

## Open PRs — merge / close before launch

| PR | Recommendation |
|----|----------------|
| [#7](https://github.com/JonasGroupEntertainment/fan-engage/pull/7) soft-launch auth UX | **Merged** at `3022e389` — baseline for this review |
| [#6](https://github.com/JonasGroupEntertainment/fan-engage/pull/6) js-yaml Dependabot | **Merge** (safe deps bump) |
| [#4](https://github.com/JonasGroupEntertainment/fan-engage/pull/4) Superfan Radar WIP | **Do not merge** into soft-launch train (admin + large binaries) |
| [#1](https://github.com/JonasGroupEntertainment/fan-engage/pull/1) Stripe Connect foundation | **Close or rewrite** — contradicts retired Connect / MoR direction |

---

## Safe for soft launch?

### Conditional checklist

**Must before any paid traffic (hard):**
- [ ] Fix Stripe webhook `processed_at` on error (A-P0-1)
- [ ] Lock membership update RLS / billing columns (A-P0-3)
- [ ] Lock `redeem_reward` to `auth.uid()` (A-P0-2)
- [ ] Confirm Stripe live/test prices + webhook endpoint on `fanengagepro.com`
- [ ] Confirm Supabase email confirm template preserves `/auth/callback?next=…` (B-P0-2)

**Must before driving guest signup traffic (hard for “excellent” first experience):**
- [ ] **Merge #11** — blank magic-link Turnstile + homepage/onboarding CTA (B-P0-5, B-P0-4)
- [ ] Signup always completes onboarding before `?next=` destinations (B-P0-1) — see #9
- [ ] Invite credit after cookie Accept path works end-to-end (B-P0-3) — Guide CS
- [ ] Guest-facing “email signup only for now” where OAuth is hidden (B-P1-0b) — Guide CS / #11
- [ ] Magic-link Turnstile never blank-disabled; CS macros prefer password (B-P0-5, B-P1-0)
- [ ] Confirm Turnstile hostname allowlist includes `fanengagepro.com`
- [ ] Reset-password expired-link UX (B-P1-9)
- [ ] Cookie banner does not cover forgot/reset/onboarding CTAs or hero (B-P1-4, B-P2-11)
- [ ] Signed-out premium/rewards CTAs prefer Create account (B-P1-7, B-P1-8)
- [ ] Published legal/rewards terms for consent modal (B-P1-11)
- [ ] Twilio fail-closed + `NEXT_PUBLIC_APP_URL` aligned (A-P1-1, A-P1-2)

**Should before / immediately after soft launch:**
- [ ] Fan-facing onboarding copy + single Finish path (B-P1-1, B-P1-2)
- [ ] Sticky mobile Join on artist page (B-P1-6)
- [ ] Empty states for events/merch (B-P1-12)
- [ ] Founder-only reward gate uses `is_founder` (A-P1-4)
- [ ] Close stale Connect PR #1; leave Radar #4 out of train
- [ ] Smoke: password login, magic-link, forgot→reset, signup→confirm→onboard→welcome points

**Explicit non-goals for this soft launch:**
- [x] Do **not** re-enable OAuth
- [x] Do **not** large-refactor Connect / network autonomy layer
- [x] Stripe Connect Express not required (MoR path)

---

## Top 10 guest-experience fixes (by impact)

1. **Magic-link Turnstile blank → loading/error/Retry** — Guide P0; never infinite-disabled blank (B-P0-5) → **#11**.
2. **Homepage CTA + `/onboarding` interstitial** — Guide P0; no wizard flash-bounce (B-P0-4) → **#11**.
3. **Never skip onboarding for `?next=`** — preserves the promised first 100 points (B-P0-1).
4. **Invite credit after cookie Accept** — influencer/fan invite links actually credit (B-P0-3).
5. **Unify `/premium` founder counter copy** — stop “97 remaining” vs “3 claimed” confusion (B-P1-13).
6. **Nav Community explicit for soft launch** — “RaeLynn community” not silent redirect (B-P1-14).
7. **OAuth-hidden messaging + password-first CS macros** — document, do not re-enable (B-P1-0b).
8. **Marketplace `don't` + JS-string apostrophe hygiene** (B-P1-0c) → **#10/#11**.
9. **Fan-facing onboarding + single Finish path** — SUPERFAN tone (B-P1-1, B-P1-2).
10. **Cookie/hero + 1280 overflow polish** (B-P2-11, B-P2-8).

---

## Suggested follow-up PRs (small, separate)

| PR | Contents |
|----|----------|
| **[#11](https://github.com/JonasGroupEntertainment/fan-engage/pull/11) Guide P0 Turnstile + onboarding CTA** | Blank magic-link Security check fix; homepage → signup; onboarding interstitial; marketplace apostrophe; singular artist tile |
| [#9](https://github.com/JonasGroupEntertainment/fan-engage/pull/9) Guest funnel P0/P1 | Broader funnel (onboarding-always next, invite, paywall CTAs, reset-password, cookie hide) — overlaps #11 on interstitial |
| [#10](https://github.com/JonasGroupEntertainment/fan-engage/pull/10) Literal apostrophe | Marketplace-only (superseded if #11 merges first) |
| Premium/Community P1 (not yet opened) | Unify founder counters (B-P1-13); Community nav label (B-P1-14) |
| Payments/RLS P0 (not yet opened) | Webhook processed_at; `redeem_reward` auth check; membership update lockdown |

---

*Generated from repository inspection at `3022e389` + Guide logged-out production walk. Re-smoke `fanengagepro.com` after merging #11.*
