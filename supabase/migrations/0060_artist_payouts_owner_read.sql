-- Fan Engage: let a community owner read their own payout ledger under RLS.
-- Renumbered from PR #4's 0047_flagged_table_rls.sql (0047 was already taken
-- by 0047_rewards_terms_policy.sql on main).
--
-- State before this migration (verified on production 2026-09-17):
--   * 20260713111819 already enabled RLS on artist_payouts and
--     leaderboard_snapshots, and gave leaderboard_snapshots its
--     authenticated-read policy.
--   * artist_payouts had RLS on but NO policies, so the signed-in browser key
--     could not read any payout rows. The artist portal worked around this by
--     reading through the service role. (0049 in this repo defines a broader
--     artist_payouts_admin_read policy for any admin role; that policy is not
--     present in production. It is dropped below so a fresh replay of the
--     ledger ends in the same owner-only state as production.)
--   * anon and authenticated still held full table grants on artist_payouts.
--
-- This migration adds the owner-read policy and trims the grants to what the
-- app actually uses. The payout cron keeps writing through service_role,
-- which bypasses RLS.
--
-- Already applied to production (uhovonrljcauaoctypbg) via MCP on 2026-09-17;
-- kept here for the repo record. Safe to re-run.

alter table public.artist_payouts enable row level security;

drop policy if exists artist_payouts_admin_read on public.artist_payouts;
drop policy if exists artist_payouts_owner_read on public.artist_payouts;
create policy artist_payouts_owner_read
  on public.artist_payouts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.role = 'owner'
        and (au.community_id = artist_payouts.community_slug or au.community_id = '*')
    )
  );

revoke all on table public.artist_payouts from anon;
revoke insert, update, delete, truncate, references, trigger on table public.artist_payouts from authenticated;
grant select on table public.artist_payouts to authenticated;
grant all on table public.artist_payouts to service_role;
