-- Kevin-approved app-access security remediation, 2026-07-14.
-- Inventory:
-- - artist_payouts is written by the payout cron through service_role and read
--   by the artist portal for the signed-in owner of that community.
-- - leaderboard_snapshots is written/read only by the leaderboard cron through
--   service_role.

do $$
begin
  if to_regclass('public.artist_payouts') is not null then
    alter table public.artist_payouts enable row level security;

    drop policy if exists artist_payouts_service_role_all on public.artist_payouts;
    create policy artist_payouts_service_role_all
      on public.artist_payouts
      for all
      to service_role
      using (true)
      with check (true);

    drop policy if exists artist_payouts_owner_select on public.artist_payouts;
    create policy artist_payouts_owner_select
      on public.artist_payouts
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.admin_users au
          where au.user_id = auth.uid()
            and au.role = 'owner'
            and (
              au.community_id = artist_payouts.community_slug
              or au.community_id = '*'
            )
        )
      );

    revoke all on table public.artist_payouts from anon;
    revoke insert, update, delete on table public.artist_payouts from authenticated;
    grant select on table public.artist_payouts to authenticated;
    grant all on table public.artist_payouts to service_role;
  end if;

  if to_regclass('public.leaderboard_snapshots') is not null then
    alter table public.leaderboard_snapshots enable row level security;

    drop policy if exists leaderboard_snapshots_service_role_all on public.leaderboard_snapshots;
    create policy leaderboard_snapshots_service_role_all
      on public.leaderboard_snapshots
      for all
      to service_role
      using (true)
      with check (true);

    revoke all on table public.leaderboard_snapshots from anon, authenticated;
    grant all on table public.leaderboard_snapshots to service_role;
  end if;
end $$;
