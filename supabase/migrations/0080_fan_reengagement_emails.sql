-- Log of day-3 and day-7 re-engagement emails already sent.
-- Service role only. Fans are not deleted. No enum values are added.
--
-- The sender is off unless REENGAGEMENT_EMAIL_ENABLED=true.
-- Apply by hand in the Supabase SQL editor, one statement at a time.

create table if not exists public.fan_reengagement_emails (
  fan_id uuid not null references public.fans(id) on delete cascade,
  step smallint not null check (step in (3, 7)),
  sent_at timestamptz not null default now(),
  primary key (fan_id, step)
);

alter table public.fan_reengagement_emails enable row level security;

revoke all on table public.fan_reengagement_emails from anon, authenticated;

comment on table public.fan_reengagement_emails is
  'Day-3 and day-7 re-engagement emails already sent to a fan. One row per step. Service role only.';
