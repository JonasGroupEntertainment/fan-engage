-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Full server-side snapshot of all public tables before any network-backbone work.
-- Copies data into backup_20260722 schema; originals untouched.
DO $$
DECLARE r record;
BEGIN
  EXECUTE 'create schema if not exists backup_20260722';
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('create table if not exists backup_20260722.%I as table public.%I', r.tablename, r.tablename);
  END LOOP;
END $$;
