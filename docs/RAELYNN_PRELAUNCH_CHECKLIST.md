# RaeLynn Fan Engage Pro Pre-Launch Checklist

Purpose: a practical Saturday/Sunday checklist for Kevin and Raymond before driving public traffic to RaeLynn on Fan Engage Pro.

Launch path to test first: `https://fanengagepro.com/signup?ref=raelynn`

**Product frame:** Fan Engage Pro = SUPERFAN artist–fan site — **not** Brand Engage. Soft-launch artist = RaeLynn.

Companion review: `docs/GUEST_AND_CODE_REVIEW.md` (post-**#11** / `93a9a2b`).

## Soft-launch auth & merch (shipped — still smoke)

Already on main via **#7** + **#11** — confirm live on prod after deploy:

- [ ] Password is the primary sign-in door; **no Turnstile on password**.
- [ ] Magic-link Security check shows loading / error + **Retry** (never blank infinite-disabled).
- [ ] Homepage CTAs go to `/signup?ref=raelynn&next=/onboarding` (no wizard flash-bounce).
- [ ] Signed-out `/onboarding` shows “Create your fan account first” interstitial.
- [ ] `/marketplace` and merch CTAs show **Coming soon** (not empty shop / not Shopify dual CTA).
- [ ] Nav label **Merch soon** while `NEXT_PUBLIC_MARKETPLACE_LIVE` is unset/false.

### CS merch script (matches Coming soon UI)

**Tell the fan:**
> The marketplace isn’t open for soft launch — you’ll see **Coming soon**. Merch is expected within about a month. You can still **create your fan profile and earn points** so you’re ready when the shop opens.

Do **not** send fans to Shopify as a parallel shop. Do **not** put a hard calendar date in guest UI beyond CS “~a month.”

## Must Pass Before Traffic

- [ ] Signup loads with RaeLynn-specific copy and imagery at `/signup?ref=raelynn`.
- [ ] New fan can create an account with email/password.
- [ ] Confirmation/magic-link flow returns to the intended next page (prefer onboarding → welcome points).
- [ ] Existing fan can sign in from `/login?next=/premium` and land back on Premium.
- [ ] Signed-out Premium monthly and annual choices route to RaeLynn signup with the Premium return path preserved.
- [ ] RaeLynn community signed-out "Create account" routes to RaeLynn signup and returns to the community.
- [ ] Header/mobile Join buttons route launch traffic to RaeLynn signup.
- [ ] No stale founding countdown appears as `0 days`.
- [ ] Premium founding copy reads cleanly — **note:** dual “spots remaining” + “X / 100 claimed” is a known display bug (B-P1-13); remaining = 100 − claimed.
- [ ] Public preview pages use fan language, not member language.
- [ ] RaeLynn artist page has correct hero crop on desktop and mobile.
- [ ] RaeLynn tour dates, social links, bio, campaign goals, and reward previews are accurate.
- [ ] Merch section / marketplace show Coming soon (RaeLynn merch not open yet).
- [ ] Stripe test-mode checkout path is confirmed by Raymond before any paid traffic.
- [ ] Premium entitlement unlocks after test checkout.
- [ ] Cancel/failed-payment behavior is understood by Raymond before launch.

## Kevin Decisions

- [ ] Confirm the exact public destination link for launch posts and ads.
  Recommended: `/signup?ref=raelynn` for pure signup, `/artists/raelynn` when fans should see the page first.
- [ ] Confirm whether Founding Fan 100 language is approved for launch.
- [ ] Confirm what Premium can promise this week versus what is coming soon.
- [ ] Approve any giveaway, signed item, meet-and-greet, livestream, or private Q&A language before publishing.
- [ ] Approve any artist-voice post that appears to come from RaeLynn or her team.
- [ ] Confirm CS can use the merch Coming soon script above (and password-first for magic-link issues).

## Raymond Checks

- [ ] Confirm Stripe test products/prices match the visible monthly and annual Premium offers.
- [ ] Confirm webhooks flip the fan to Premium after checkout (watch A-P0-1 retry bug before paid traffic).
- [ ] Confirm refund/cancel/downgrade handling is clear enough for support.
- [ ] Confirm Supabase production data for RaeLynn is correct: active community, pricing, founder cap, hero focal point, events, rewards.
- [ ] Confirm Turnstile hostname allowlist includes `fanengagepro.com`.
- [ ] Confirm `NEXT_PUBLIC_MARKETPLACE_LIVE` is **not** set true until merch provider is ready.
- [ ] Confirm any hidden admin launch controls are not left in a test state.
- [ ] Confirm monitoring plan for launch day: auth errors, checkout errors, Vercel logs, Supabase logs, Stripe events.

## RaeLynn Content To Add

- [ ] Pinned welcome post from RaeLynn or the team.
- [ ] "Where are you listening from?" intro thread.
- [ ] Poll: "Which RaeLynn song should get a behind-the-song post first?"
- [ ] Tour RSVP prompt for the next visible dates.
- [ ] Behind-the-song clip or note.
- [ ] Premium preview post explaining what Premium fans will see first.
- [ ] Founder Wall / Founding Fan post if Kevin approves that campaign language.
- [ ] First community challenge: post a RaeLynn concert memory or favorite lyric.

## Launch-Day Smoke Test

- [ ] Open launch link in an incognito/private browser.
- [ ] Open launch link on mobile.
- [ ] Create one disposable test fan account.
- [ ] Confirm signup validation, Turnstile, confirmation link, onboarding/return path, and logout/login work.
- [ ] Password login works without Turnstile; magic-link Retry path works when Security check fails.
- [ ] Visit RaeLynn page, Premium page, Rewards, Community, Marketplace (Coming soon), and Account/Billing.
- [ ] Confirm nav **Merch soon** and no Official store / Shopify dual CTA on artist page.
- [ ] Run one Stripe test checkout if Raymond confirms test-mode is active.
- [ ] Verify the fan sees Premium access after checkout.
- [ ] Capture screenshots of the final signup, RaeLynn page, Premium page, Marketplace Coming soon, and Community page for reference.

## Do Not Launch Until Resolved

- [ ] Any signup/login loop.
- [ ] Any magic-link returning to the wrong app/domain.
- [ ] Any Premium button that is disabled for signed-out fans without a clear signup path.
- [ ] Any visible test post that weakens the RaeLynn launch impression.
- [ ] Any unclear Premium promise that RaeLynn or the team has not approved.
- [ ] Any live-charge risk while testing.
- [ ] Payment/RLS P0s from `GUEST_AND_CODE_REVIEW.md` (A-P0-1 / A-P0-2 / A-P0-3) before paid traffic.
