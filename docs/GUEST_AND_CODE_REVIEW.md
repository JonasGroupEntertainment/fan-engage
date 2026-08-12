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
| Password login | Primary | No Turnstile; clear “Welcome back” copy |
| Magic link | Secondary | Turnstile + 45s cooldown; “newest link wins” copy is good |
| Signup | Email + password | Turnstile + consent modal; OAuth **commented out** (correct — do not re-enable) |
| Forgot / reset | Working shape | Turnstile on forgot; reset page lacks session/expired-link UX |
| OAuth | Gated | Blocked until custom auth domain (`LAUNCH_CHECKLIST` G.4) |

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
- **Paths:** `frontend/app/onboarding/page.tsx` (~139–153); also `frontend/app/onboarding/mission/page.tsx` (~59–61)
- **Verified in code:** Client wizard mounts and renders immediately. `useEffect` calls `supabase.auth.getUser()`; if unauthenticated (or session incomplete/expired), `router.replace(/signup?next=…&ref=…)`. Deep links and landing CTAs that still point at `/onboarding` (or bookmarks / shared links) show a fake “onboarding started” moment, then yank first-timers to signup.
- **Why it hurts SUPERFAN guests:** Feels broken (“the join flow crashed”), not “create an account first.” Confuses CS and first-timers on soft launch.
- **Fix:** Do **not** render the wizard until auth is resolved. For signed-out visitors, show a clear interstitial: “Create your fan account first to join this artist’s experience” + primary **Create account** (`/signup?ref=…&next=/onboarding…`) + secondary **Sign in**. Optional: server-side redirect in a layout/page wrapper so HTML never includes the wizard for anon. Point marketing CTAs at `/signup?ref=raelynn` (related: B-P1-10).

### P1 — soft-launch friction / trust / mobile

#### B-P1-0. Magic-link path: Turnstile + PKCE support load (Guide CS theme)
- **Paths:** `frontend/app/login/page.tsx` (magic-link secondary); `frontend/components/turnstile-widget.tsx`; `frontend/app/auth/callback/route.ts`
- **Why (Guide):** Returning fans who pick “Email me a magic link instead” must wait for Cloudflare Turnstile script load/complete before the button enables; each resend invalidates the prior PKCE link (“newest link wins”). Slow networks, cached Turnstile 503s, or impatient resends generate “link doesn’t work” tickets even when password login would have been fine.
- **Fix:** Keep password primary (already done). Add a short loading state while Turnstile script injects (“Security check loading…”) instead of a dead button; surface cooldown + “use the newest link” more prominently after send; in CS macros, steer soft-launch fans to password + forgot-password first. Do not put Turnstile on the password door.

#### B-P1-0b. OAuth hidden with no guest-facing explanation (Guide CS theme)
- **Paths:** `frontend/app/signup/signup-form.tsx` (OAuth block commented out until custom auth domain / G.4); login has no Google/Apple either
- **Why (Guide):** Soft-launch fans expect “Continue with Google.” Buttons are gone with **no** “Email signup only for now” line — looks incomplete or broken, not intentional.
- **Fix:** One calm line under the signup/login email forms: “Google & Apple sign-in coming soon — create your fan account with email for now.” **Do not re-enable OAuth** until custom auth domain.

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
- [ ] Signup always completes onboarding before `?next=` destinations (B-P0-1)
- [ ] `/onboarding` signed-out: interstitial, no wizard flash / silent bounce (B-P0-4) — Guide CS
- [ ] Invite credit after cookie Accept path works end-to-end (B-P0-3) — Guide CS
- [ ] Guest-facing “email signup only for now” where OAuth is hidden (B-P1-0b) — Guide CS
- [ ] Magic-link Turnstile loading/PKCE copy clear enough for CS macros (B-P1-0) — Guide CS
- [ ] Reset-password expired-link UX (B-P1-9)
- [ ] Cookie banner does not cover forgot/reset/onboarding CTAs (B-P1-4)
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

1. **`/onboarding` signed-out interstitial (no wizard flash)** — Guide CS production report; stops “broken join” bounce (B-P0-4).
2. **Never skip onboarding for `?next=`** — preserves the promised first 100 points and profile (B-P0-1).
3. **Guarantee email-confirm lands on onboarding when profile incomplete** — closes the silent home dead-end (B-P0-2).
4. **Invite credit after cookie Accept** — influencer/fan invite links actually credit (B-P0-3).
5. **Signed-out Premium / rewards CTAs → Create account first** — stops sending new fans to the returning-fan door (B-P1-7, B-P1-8).
6. **OAuth-hidden + magic-link Turnstile/PKCE support clarity** — fewer “where’s Google?” / “link broken” tickets (B-P1-0, B-P1-0b).
7. **Reset-password expired session state** — recovers forgot-password edge cases (B-P1-9).
8. **Fan-facing onboarding + single Finish path** — SUPERFAN tone (artist/drops/rewards), not demo/ops (B-P1-1, B-P1-2).
9. **Sticky mobile Join on artist hub** — keeps the primary conversion CTA visible (B-P1-6).
10. **Artist empty states + SUPERFAN/fan language** — artist hub feels like a fan experience, not a brand program (B-P1-12, B-P2-1).

---

## Suggested follow-up PRs (small, separate)

| PR | Contents |
|----|----------|
| [#9](https://github.com/JonasGroupEntertainment/fan-engage/pull/9) Guest funnel P0/P1 | Onboarding-always; cookie hide list; reset-password guard; paywall/rewards signup CTAs; invite attribution; Turnstile fail-closed honor; `/onboarding` signed-out interstitial (Guide); OAuth-hidden messaging |
| Payments/RLS P0 (not yet opened) | Webhook processed_at; `redeem_reward` auth check migration; membership update lockdown |
| Ops P1 (not yet opened) | Twilio fail-closed; `.env.example`; founder reward gate |

---

*Generated from repository inspection at `3022e389`. Re-smoke production after merging companion fix PRs.*
