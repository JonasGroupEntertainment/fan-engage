# Password recovery enablement

Forgot / reset password is implemented on `/forgot-password` and
`/reset-password`. Production keeps those routes **404** until the feature
flag is on, so a broken public form cannot ship. Preview and local dev
render the form so recovery can be proven before flipping production.

Live `www.fanengagepro.com/forgot-password` 404s until the Production env
var below is set **and** this branch is merged.

## After merge — Vercel Production

Set these on the `fan-engage` project, Production environment, then
**redeploy** (NEXT_PUBLIC_* is baked in at build time):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED` | `true` |
| `NEXT_PUBLIC_APP_URL` | `https://www.fanengagepro.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://www.fanengagepro.com` |

Do **not** set `NEXT_PUBLIC_APP_URL` to `VERCEL_URL`,
`https://fan-engage-pearl.vercel.app`, or the apex
`https://fanengagepro.com`. Those leak into `redirect_to` on recovery
emails and break PKCE cookies across hosts.

Preview can omit `NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED` (the form stays
available on preview/dev). Set it to `false` on Preview only if you need
to hide the form there.

Turnstile must already be configured for signup. Recovery sends the same
widget token to Supabase Auth (`captchaToken` on
`resetPasswordForEmail`). Pair the widget with the Turnstile secret in
**Supabase → Authentication → Bot and Abuse Protection (CAPTCHA)**.

## After merge — Supabase Auth

Dashboard: Authentication → URL Configuration.

**Site URL**

```
https://www.fanengagepro.com
```

**Redirect URLs** (allowlist). Include **www**. Apex and pearl must not be
the only entries:

```
https://www.fanengagepro.com/auth/callback
https://www.fanengagepro.com/**
https://fanengagepro.com/**
http://localhost:3000/**
https://*-jonas-group.vercel.app/**
```

Middleware 308s apex / pearl → www, but GoTrue will refuse
`redirect_to` if www is missing from this list.

### Recovery email template (recommended — skips PKCE)

Authentication → Email Templates → **Reset Password**. Use a token-hash
link so the fan does not need the original browser cookie:

```html
<h2>Reset your Fan Engage password</h2>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset password</a></p>
```

`{{ .ConfirmationURL }}` still works (PKCE `?code=`). This branch
exchanges that code in the **browser** when the server cannot see the
PKCE cookie (the 2026-08-26 “PKCE code verifier not found in storage”
failure on the cross-site redirect from `*.supabase.co`). Same-browser
recovery should succeed without the template change. Cross-device /
in-app email browsers still need the token-hash template above.

Confirm the Recovery template does **not** point at
`fan-engage-pearl.vercel.app` or apex-only Site URL.

## How to verify

1. Preview of this branch: `/forgot-password` returns 200. `/login` shows
   **Forgot password?**.
2. Request a reset with Turnstile completed. Open the newest email in the
   **same browser** that requested it.
3. You should land on `/reset-password` with a set-password form (not
   “Reset link expired”).
4. After merge, set the Production flag, redeploy, repeat on
   `https://www.fanengagepro.com`.

If the email link still fails after the template change, check in order:
www on the redirect allowlist, `NEXT_PUBLIC_APP_URL=https://www.fanengagepro.com`,
Site URL is www, and the fan opened the **newest** link (resend overwrites
the previous PKCE verifier).
