-- 0114_app_errors.sql
--
-- An error log kept in the app's own database for 90 days. Until now
-- errors were only short-lived Vercel log lines.
--
-- Not yet applied to production.
--
-- Written only by the server with the service role:
--   source 'client': the error page in a fan's browser
--     (app/error.tsx, app/global-error.tsx -> /api/client-error)
--   source 'server': Next.js onRequestError (frontend/instrumentation.ts)
-- Read on /admin/errors (super admins only, service role).
--
-- Privacy: no fan id, no email, no query string. Messages are redacted
-- before they are stored (frontend/lib/client-error-report.ts) and capped
-- here as a backstop.
--
-- Retention: purge_old_app_errors() deletes rows older than 90 days. The
-- daily admin brief cron calls it once a day.
--
-- Safely re-runnable. Rollback: drop function purge_old_app_errors(int);
-- drop table app_errors.

create table if not exists public.app_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text not null check (source in ('client', 'server')),
  message     text not null check (char_length(message) <= 300),
  digest      text check (digest is null or char_length(digest) <= 64),
  path        text not null check (char_length(path) <= 200),
  route_path  text check (route_path is null or char_length(route_path) <= 200),
  route_type  text check (route_type is null or char_length(route_type) <= 20)
);

create index if not exists app_errors_created_idx on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;
-- No policies: fans and visitors can neither read nor write. The
-- service role bypasses RLS.
revoke all on public.app_errors from anon, authenticated;

create or replace function public.purge_old_app_errors(p_keep_days int default 90)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_deleted integer;
begin
  delete from public.app_errors
   where created_at < now() - make_interval(days => greatest(p_keep_days, 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke all on function public.purge_old_app_errors(int) from public, anon, authenticated;
grant execute on function public.purge_old_app_errors(int) to service_role;
