# SMS — Mailchimp only

Mailchimp Transactional SMS is the only texting service. Twilio is not used.

The sender is `POST https://mandrillapp.com/api/1.4/messages/send-sms`. One phone number per request. The from-number is `MAILCHIMP_SMS_FROM` (`+16152377488`, the Jonas Group US 10DLC approved 16 Oct 2026). The API key is `MAILCHIMP_TRANSACTIONAL_API_KEY`, or `MANDRILL_API_KEY` when that is unset. That key is not the Marketing API key.

If those values are missing, or Mailchimp returns an error, the send is logged and skipped. It does not throw, and the fan action that triggered it still completes.

Opt-in is required (`fans.sms_opted_in`). A known birth date under 18 is refused at send time and on START. A fan with no birth date on file keeps a prior opt-in.

## Shared number with Brand Engage Pro

Brand Engage Pro (`KevinJonasSr/brand-engage-pro`) uses this same Mailchimp account and this same number. Mailchimp allows one inbound route per number. Fan Engage is that route. Brand Engage does not register its own.

1. `POST /api/mailchimp/sms/inbound` checks `X-Mandrill-Signature`.
2. If the sender's phone matches a Fan Engage fan, Fan Engage applies STOP, HELP, or START.
3. Fan Engage then POSTs the event to `BEP_SMS_FORWARD_URL`.

The body is JSON, with these keys in this order:

```json
{"from":"+16155550123","to":"+16152377488","text":"STOP","ts":"2026-11-18T12:00:00.000Z","event_id":"..."}
```

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-SMS-Forward-Signature` | hex HMAC-SHA256 of the raw body, key `SMS_FORWARD_SECRET` |
| `X-SMS-Forward-Timestamp` | ISO-8601 time when Fan Engage sent the POST |

Brand Engage rejects the POST when the signature does not match the raw body, or when the timestamp is missing or more than 5 minutes from its clock. The check lives in `frontend/lib/sms/forward.ts` (`smsForwardAccepted`) so both apps share one rule.

Forwarding is best-effort, with a 4 second timeout. A failure is logged. It does not change Fan Engage's reply to Mailchimp. If `BEP_SMS_FORWARD_URL` or `SMS_FORWARD_SECRET` is unset, the forward is skipped.

STOP (and the other stop words in `frontend/lib/sms/keywords.ts`) opts that number out in Fan Engage when it belongs to a Fan Engage fan, including when the event is also forwarded. A number Fan Engage does not know is not written to the shared Transactional denylist, so Brand Engage can still apply its own START. A START from a number Fan Engage does not know is a no-op in Fan Engage. A known under-18 fan who texts START is not opted in, is not texted, and is put on the shared Transactional denylist. That denylist is the Mailchimp account both apps use, so Brand Engage will not text that number either until it is removed.

Mailchimp auto-answers HELP and STOP on 10DLC. Fan Engage does not send those replies. HELP and START replies from Fan Engage stay off unless `MAILCHIMP_SMS_SEND_KEYWORD_REPLIES=true`.

## Message classification

The list is `SMS_MESSAGE_CLASSIFICATION` in `frontend/lib/sms/kinds.ts`. Every send passes `messageType` and `messageKind`. A kind that does not match the list is refused.

Mailchimp's docs limit Transactional SMS to non-promotional messages. Whether promotional texts may use Transactional, or must be Marketing campaigns, is still open with Mailchimp. This app does not build Marketing campaigns. `sendPromotionalSms` in `frontend/lib/sms/deliver.ts` is the function to replace when that decision lands. Callers stay as they are.

`MAILCHIMP_SMS_PROMOTIONAL_ENABLED` defaults to off. While it is unset, promotional sends are not attempted. The log line is:

`Mailchimp SMS blocked promotional <messageType>: MAILCHIMP_SMS_PROMOTIONAL_ENABLED is not set`

Set the variable to `true` to let those sends use Transactional SMS. That is the whole change.

| messageType | kind | What it is | Sends today |
|---|---|---|---|
| `rsvp_confirmation` | transactional | RSVP confirmation | yes, when Mailchimp is configured |
| `redemption_fulfilled` | transactional | Redemption fulfilled | yes |
| `redemption_denied` | transactional | Redemption denied and points refunded | yes |
| `comment_on_my_post` | transactional | Reply to the fan's own post | yes |
| `keyword_reply` | transactional | HELP or START, only if keyword replies are turned on | no, unless `MAILCHIMP_SMS_SEND_KEYWORD_REPLIES=true` |
| `welcome` | promotional | Onboarding welcome with a points call to action | blocked |
| `admin_owner_blast` | promotional | Admin or owner broadcast | blocked |
| `campaign_sms` | promotional | Campaign SMS | blocked |
| `drop_launched` | promotional | Drop went live | blocked |
| `drop_expiring` | promotional | Drop ending soon | blocked |
| `new_post` | promotional | New community post | blocked |
| `event_match` | promotional | Event announcement or match | blocked |
| `event_reminder` | promotional | 24h, 1h, or manual reminder | blocked |
| `leaderboard` | promotional | Rank, first place, or month-end nudge | blocked |
| `anniversary` | promotional | Anniversary, including a points call to action | blocked |
| `prediction_resolved` | promotional | Prediction result, including a points call to action | blocked |
| `streak_at_risk` | promotional | Streak reminder | not sent; the trigger is push only, and the class is promotional if SMS is added later |

Transactional rows still require opt-in, a phone number, and the 18+ rule. Several also keep the Gold-tier gate unless the trigger passes `bypassSmsTierGate` (RSVP confirmation and both redemption texts do).

## Webhooks to register in Mailchimp

Production host is `https://www.fanengagepro.com`.

| Purpose | URL |
|---|---|
| Inbound SMS (one route for `+16152377488`) | `https://www.fanengagepro.com/api/mailchimp/sms/inbound` |
| Transactional events (SMS unsub, denylist, reject) | `https://www.fanengagepro.com/api/mailchimp/sms/events` |
| Marketing audience, event "SMS unsubscribes" | `https://www.fanengagepro.com/api/mailchimp/sms/audience?key=<MAILCHIMP_AUDIENCE_WEBHOOK_SECRET>` |

The inbound route is added with `POST https://mandrillapp.com/api/1.4/inbound/add-route` (`phone` = `+16152377488`). The events webhook is Transactional → Webhooks, or `POST /webhooks/add`. Its `auth_key` is `MAILCHIMP_SMS_WEBHOOK_KEY`. The signature covers the exact URL, so set `MAILCHIMP_SMS_INBOUND_URL` or `MAILCHIMP_SMS_EVENTS_URL` only when the registered URL is not the one above.

An email unsubscribe does not clear SMS consent.

## Env vars

| Name | Required | Notes |
|---|---|---|
| `MAILCHIMP_TRANSACTIONAL_API_KEY` | yes, unless `MANDRILL_API_KEY` is set | Transactional → Settings. Not the Marketing key. |
| `MAILCHIMP_SMS_FROM` | yes | `+16152377488` |
| `MAILCHIMP_SMS_WEBHOOK_KEY` | yes, before real inbound or event posts | `auth_key` from `webhooks/add` |
| `MAILCHIMP_AUDIENCE_WEBHOOK_SECRET` | yes, before the audience webhook | `openssl rand -hex 32`. Put the same value in the `key` query. |
| `BEP_SMS_FORWARD_URL` | when Brand Engage is ready | `https://<bep-domain>/api/sms/inbound-forward` |
| `SMS_FORWARD_SECRET` | with the URL above | Shared with Brand Engage. `openssl rand -hex 32`. |
| `MAILCHIMP_SMS_PROMOTIONAL_ENABLED` | no | Unset blocks promotional sends. `true` allows them on Transactional. |
| `MAILCHIMP_SMS_CONSENT` | no | Unset sends `recurring-no-confirm`. |
| `MAILCHIMP_SMS_INBOUND_URL`, `MAILCHIMP_SMS_EVENTS_URL` | no | Only if the registered URL is not the production path. |
| `MAILCHIMP_SMS_SEND_KEYWORD_REPLIES` | no | Unset means do not send HELP or START replies. |

## Legal copy still stored in the database

`policy_pages` is the live terms and privacy text. Migration `0009_legal_infrastructure.sql` seeded a draft privacy paragraph that names Twilio:

`We share it only with service providers (Supabase, Mailchimp, Twilio)`

That migration is already applied. This change does not edit it and does not run SQL. While rendering, `applyStoredSmsVendorName` rewrites a stored "Twilio" to Mailchimp, including that parenthetical. The sentence `mobile opt-in data will not be shared with third parties` is unchanged.

The row in the database still says Twilio until someone edits it in `/admin/policies`. Comments in applied migrations `0068_channel_opt_in_timestamps.sql` and `0070_age_check.sql` also still say Twilio. They are not shown to fans.

Living product docs name Mailchimp. The dated handoff pages name Mailchimp as well. Applied migration comments are unchanged.
