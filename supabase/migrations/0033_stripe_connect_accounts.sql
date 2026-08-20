-- Migration 0033 — Stripe Connect on artists
--
-- Adds the columns we need to track each artist's Stripe Connect (Express)
-- account, plus the per-artist membership-share percentage. Mirror flags
-- (charges_enabled, payouts_enabled, details_submitted) are populated from
-- the account.updated webhook so the admin UI can render without a Stripe
-- API roundtrip.
--
-- Idempotent — every operation guards with `if not exists` / `drop … if
-- exists` per the repo's migration convention. Safe to re-run.
--
-- Apply via Supabase SQL editor on project uhovonrljcauaoctypbg.

alter table artists
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_type text not null default 'express',
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_account_created_at timestamptz,
  add column if not exists membership_share_pct numeric(5,2) not null default 80.00;

-- Bound the split percentage to a sane range. CHECK constraints aren't
-- idempotent the same way columns are, so we drop+add to make re-running safe.
alter table artists drop constraint if exists artists_membership_share_pct_range;
alter table artists
  add constraint artists_membership_share_pct_range
  check (membership_share_pct >= 0 and membership_share_pct <= 100);

-- Each Stripe Connect account ID maps to exactly one artist. Partial unique
-- index so multiple un-onboarded artists (NULL stripe_account_id) don't collide.
create unique index if not exists artists_stripe_account_id_uniq
  on artists(stripe_account_id)
  where stripe_account_id is not null;

-- Helpful index for the super-admin "all Connect accounts" view.
create index if not exists artists_stripe_payouts_enabled_idx
  on artists(stripe_payouts_enabled)
  where stripe_account_id is not null;

comment on column artists.stripe_account_id is
  'Stripe Connect account id (acct_…). Null until artist starts onboarding. Unique across artists.';
comment on column artists.stripe_account_type is
  'Express (default), Custom, or Standard. Currently only Express is supported in code.';
comment on column artists.stripe_charges_enabled is
  'Mirror of Stripe account.charges_enabled. Updated by the account.updated webhook.';
comment on column artists.stripe_payouts_enabled is
  'Mirror of Stripe account.payouts_enabled. Updated by the account.updated webhook.';
comment on column artists.stripe_details_submitted is
  'Mirror of Stripe account.details_submitted. True once the artist has completed onboarding.';
comment on column artists.stripe_account_created_at is
  'When we first created the Stripe account on the artist''s behalf.';
comment on column artists.membership_share_pct is
  'Percentage of paid-membership revenue that goes to the artist (0-100). Default 80.';
