-- 0103_lock_down_trigger_functions.sql
--
-- Port of Brand Engage Pro 0094 / 0095 (#154). BEP found SECURITY DEFINER
-- trigger functions added after its blanket lock-down that the Supabase
-- advisor listed as callable over the API. FEP's 0062 did the same blanket
-- revoke, and 0085 / 0088 / 0099 / 0102 revoke their own new functions, but
-- `create or replace` on a function that was first created after 0062
-- without a revoke (or recreated by hand in the SQL editor) would leave it
-- open. This sweep closes every one at once instead of naming them.
--
-- Scope: SECURITY DEFINER functions in public whose return type is
-- `trigger`. Postgres does not check EXECUTE when a trigger fires, so every
-- trigger keeps working. A trigger function cannot be called directly over
-- PostgREST in a useful way anyway; this is advisor hygiene, belt and braces.
--
-- Idempotent: re-running revokes what is already revoked. No table changes.
-- Check before / after:
--   select p.oid::regprocedure, has_function_privilege('anon', p.oid, 'execute')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef
--      and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;
