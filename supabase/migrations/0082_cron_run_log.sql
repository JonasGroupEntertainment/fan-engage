-- 0082_cron_run_log.sql
--
-- Apply manually. NOT applied.
-- Do not run this against production from an agent.
-- Apply by hand in the Supabase SQL editor, one statement at a time,
-- in order. Fan Engage project: uhovonrljcauaoctypbg.
--
-- cron_runs records a failed invocation of every scheduled cron except
-- weekly-digest. weekly-digest failures go to digest_log with
-- status = 'error' and the error text in error_message.
--
-- digest_log.fan_id has to be nullable for that: a bad CRON_SECRET or
-- missing MAILCHIMP_* fails before any fan is loaded. Per-fan rows are
-- unchanged. Postgres unique (fan_id, week_start) still allows many
-- null fan_id rows, so each failed tick is kept.

-- 1
alter table public.digest_log alter column fan_id drop not null;

-- 2
comment on column public.digest_log.fan_id is
  'Fan this digest attempt belongs to. Null only for a run-level failure (auth, missing Mailchimp env, recipient query) before any fan was processed.';

-- 3
create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null default 'error' check (status in ('error', 'ok')),
  error_message text,
  http_status integer,
  detail jsonb,
  finished_at timestamptz not null default now()
);

-- 4
comment on table public.cron_runs is
  'Service-role log of failed crons from frontend/vercel.json, other than weekly-digest (that one writes digest_log). NOT applied until this file is run by hand.';

-- 5
create index if not exists cron_runs_job_finished_idx
  on public.cron_runs (job, finished_at desc);

-- 6
alter table public.cron_runs enable row level security;

-- 7
drop policy if exists cron_runs_admin_read on public.cron_runs;

-- 8
create policy cron_runs_admin_read on public.cron_runs
  for select to authenticated using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = auth.uid() and a.role in ('owner', 'admin')
    )
  );

-- 9
grant select on public.cron_runs to authenticated;

-- 10
grant all on public.cron_runs to service_role;
