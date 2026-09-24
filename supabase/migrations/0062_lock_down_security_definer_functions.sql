-- Fan Engage: lock down SECURITY DEFINER functions.
-- Already applied to production via MCP on 2026-09-24; kept here for the repo record.
--
-- Before this migration, 41 SECURITY DEFINER functions in public could be
-- called by anyone holding the public anon key (Supabase advisor 0028/0029).
-- Several of them write data (award_community_badge, bump_membership_points,
-- claim_founder_slot, upsert_notification) or read data across fans
-- (list_digest_recipients, evaluate_audience_segment, fan_ledger_balance).
--
-- Approach: revoke EXECUTE on every SECURITY DEFINER function in public from
-- PUBLIC, anon and authenticated, keep service_role, then grant back only
-- what a browser session or an outside caller actually needs.
--
-- Trigger functions are included. Postgres does not check EXECUTE when a
-- trigger fires, so the triggers keep working.
--
-- Kept, and why (checked against origin/main 439a36c on 2026-09-24):
--   anon + authenticated
--     is_admin_of            used by RLS policies that apply to PUBLIC
--     get_fan_display_names  community pages call it with the session client;
--                            returns first names only
--     network_ingest_event   Papa Jonas, RaeLynn and BEP post events with the
--                            hub anon key plus a publisher key
--     network_agent_pull,    network agents call these with the anon key;
--     network_agent_submit,  each one rejects a missing or disabled
--     network_command_pull   publisher key
--   authenticated only
--     redeem_reward          lib/data/rewards.ts uses the session client; the
--                            function rejects p_fan_id <> auth.uid()
--     is_member_of           only answers for auth.uid()
--
-- Everything else the app calls (claim_founder_slot, award_community_badge,
-- evaluate_audience_segment, fan_ledger_balance, recommend_rewards_for_fan,
-- claim_founding_fan_status, the list_* cron helpers) goes through
-- createAdminClient(), which uses service_role.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

-- Invoker wrapper around list_digest_recipients; cron only.
revoke execute on function public.list_digest_recipients_at_hour(smallint, integer) from public, anon, authenticated;
grant execute on function public.list_digest_recipients_at_hour(smallint, integer) to service_role;

grant execute on function public.is_admin_of(text) to anon, authenticated;
grant execute on function public.get_fan_display_names(uuid[]) to anon, authenticated;
grant execute on function public.network_ingest_event(uuid, jsonb) to anon, authenticated;
grant execute on function public.network_agent_pull(uuid) to anon, authenticated;
grant execute on function public.network_agent_submit(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.network_command_pull(uuid) to anon, authenticated;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated;
grant execute on function public.is_member_of(text) to authenticated;
