-- 0109_marketing_consent_records.sql
--
-- Applied to production on 2026-11-27 (ledger version 20261127165851),
-- after PR #217 was live. Checked after: the four columns exist, all
-- nullable with no default, and no fan row changed.
--
-- Keep a record of each fan's marketing email and text consent. Port of
-- Brand Engage Pro 0123.
--
-- Before: fans.email_opted_in and fans.sms_opted_in were plain true/false
-- flags, and the join form set email_opted_in to true for every fan who
-- gave an email, with no box to tick. consent_accepted_at only records the
-- Terms and Privacy box. email_opted_in_at and sms_opted_in_at (0068)
-- record when a flag last flipped to true, which for email was the
-- automatic opt-in, not a tick.
--
-- After: four nullable columns. The app stamps them on the server at the
-- moment a ticked box arrives (the join form, the in-app question, or the
-- switches in /me/notifications), with the version of the wording the fan
-- saw (frontend/lib/marketing-consent.ts). Marketing email is sent only to
-- fans who have email_consent_at.
--
-- Nothing is backfilled: existing fans keep null, which honestly says
-- "no recorded consent". Fans the old form opted in are asked again in
-- the app.
--
-- Additive only. The app tolerates a database without these columns: the
-- join form still saves, and every marketing email sender finds nobody to
-- send to. Apply this before relying on any marketing email.

alter table public.fans
  add column if not exists email_consent_at timestamptz,
  add column if not exists email_consent_version text,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_version text;

comment on column public.fans.email_consent_at is
  'When the fan ticked the marketing email box. Server time. Null = no recorded consent.';
comment on column public.fans.email_consent_version is
  'EMAIL_CONSENT_VERSION in frontend/lib/marketing-consent.ts at the time of the tick.';
comment on column public.fans.sms_consent_at is
  'When the fan ticked the text box (join form) or turned texts on in settings. Server time.';
comment on column public.fans.sms_consent_version is
  'SMS_CONSENT_VERSION in frontend/lib/marketing-consent.ts at the time of the tick.';
