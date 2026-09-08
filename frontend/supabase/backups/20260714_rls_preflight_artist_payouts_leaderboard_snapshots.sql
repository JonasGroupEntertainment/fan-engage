-- Run before applying 20260714_artist_payouts_leaderboard_snapshots_rls.sql.
-- Captures schema/RLS/policy/grant state without dumping row data.

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('artist_payouts', 'leaderboard_snapshots')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('artist_payouts', 'leaderboard_snapshots')
order by tablename, policyname;

select
  table_schema,
  table_name,
  privilege_type,
  grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('artist_payouts', 'leaderboard_snapshots')
order by table_name, grantee, privilege_type;
