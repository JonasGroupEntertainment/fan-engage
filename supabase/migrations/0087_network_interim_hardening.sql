-- 0087_network_interim_hardening.sql
--
-- Interim hardening of the Jonas Network RPCs that live in this database.
--
-- Decision (Kevin, Oct 2026): the Jonas Network will be extracted from Fan
-- Engage into its own system. Until that happens, the three SECURITY DEFINER
-- doors that feeder apps and agents knock on via PostgREST stay in place but
-- are no longer callable with the public anon key or a fan JWT:
--
--   public.network_ingest_event(p_api_key uuid, p_event jsonb)   -- 20260722112525_network_backbone_v1
--   public.network_agent_pull(p_api_key uuid)                     -- 20260724132115_network_agent_rpcs_v1
--   public.network_agent_submit(p_api_key uuid, p_kind text, p_payload jsonb)
--
-- Each was granted to anon + authenticated by its own migration and again by
-- 0062. The only thing gating them was the per-publisher / per-agent api key
-- inside the payload, so anyone holding the (public) anon key could probe
-- them. From here on they are service_role only: a caller must go through a
-- server that holds the service key.
--
-- Effect on callers: frontend/lib/network-client (createNetworkClient) posts
-- to /rest/v1/rpc/network_ingest_event with the hub anon key. Nothing in
-- this app instantiates it, but any sister app (BEP, Song Intelligence,
-- jg-advisors) still doing so will get 401/403 and emit() resolves null —
-- it never throws — so feeders degrade to silent no-ops. Re-point them at a
-- service-role-backed route when the Network is extracted.
--
-- Nothing is dropped. Idempotent: each block checks the exact signature
-- exists before touching grants, so this is a no-op on a database where the
-- network layer was never applied. network_command_pull(uuid) is deliberately
-- left as-is (out of scope for this pass).

do $$
begin
  if to_regprocedure('public.network_ingest_event(uuid, jsonb)') is not null then
    revoke execute on function public.network_ingest_event(uuid, jsonb) from public, anon, authenticated;
    grant execute on function public.network_ingest_event(uuid, jsonb) to service_role;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.network_agent_pull(uuid)') is not null then
    revoke execute on function public.network_agent_pull(uuid) from public, anon, authenticated;
    grant execute on function public.network_agent_pull(uuid) to service_role;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.network_agent_submit(uuid, text, jsonb)') is not null then
    revoke execute on function public.network_agent_submit(uuid, text, jsonb) from public, anon, authenticated;
    grant execute on function public.network_agent_submit(uuid, text, jsonb) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ─── Verify (SQL editor) ───────────────────────────────────────────────────
-- select routine_name, grantee, privilege_type
--   from information_schema.routine_privileges
--  where routine_schema = 'public'
--    and routine_name in ('network_ingest_event', 'network_agent_pull', 'network_agent_submit')
--  order by routine_name, grantee;
-- -- Expected: service_role (and the owner) only; no anon / authenticated / PUBLIC
