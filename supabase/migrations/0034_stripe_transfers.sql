-- Migration 0034 — stripe_transfers audit log
--
-- Append-only log of every Stripe Connect transfer the platform initiates
-- toward an artist. Never delete rows. Status flipped by webhook handlers.
--
-- Idempotent. Apply via Supabase SQL editor on project uhovonrljcauaoctypbg.

create table if not exists stripe_transfers (
    id uuid primary key default gen_random_uuid(),
    artist_slug text not null references artists(slug) on delete restrict,
    stripe_transfer_id text not null,
    stripe_destination_account text not null,
    amount_cents integer not null check (amount_cents >= 0),
    currency text not null default 'usd',
    source_type text not null check (source_type in (
      'merch_sale', 'membership_share', 'referral_commission', 'manual', 'reversal'
    )),
    source_reference jsonb not null default '{}'::jsonb,
    status text not null default 'pending' check (status in (
      'pending', 'paid', 'failed', 'reversed'
    )),
    initiated_at timestamptz not null default now(),
    completed_at timestamptz,
    failure_reason text,
    metadata jsonb not null default '{}'::jsonb
  );

create unique index if not exists stripe_transfers_stripe_id_uniq
  on stripe_transfers(stripe_transfer_id);

create index if not exists stripe_transfers_artist_idx
  on stripe_transfers(artist_slug, initiated_at desc);

create index if not exists stripe_transfers_status_idx
  on stripe_transfers(status)
  where status in ('pending', 'failed');

alter table stripe_transfers enable row level security;

drop policy if exists stripe_transfers_super_admin_read on stripe_transfers;
create policy stripe_transfers_super_admin_read on stripe_transfers
  for select
  using (
      auth.jwt() ->> 'email' = any (
        string_to_array(
          coalesce(current_setting('app.super_admin_emails', true), ''),
          ','
        )
      )
    );

comment on table stripe_transfers is
  'Append-only audit log of platform → artist Stripe Connect transfers. Never delete rows.';
comment on column stripe_transfers.stripe_transfer_id is
  'Stripe transfer object id (tr_…). Unique. Source of truth for whether a transfer happened.';
comment on column stripe_transfers.source_type is
  'Why this transfer was initiated.';
