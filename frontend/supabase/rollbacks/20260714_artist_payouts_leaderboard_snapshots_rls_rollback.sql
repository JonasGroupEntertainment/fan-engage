-- Rollback for 20260714_artist_payouts_leaderboard_snapshots_rls.sql.
-- Restores the broad direct grants present before the least-privilege RLS
-- remediation. Use only if production verification shows approved behavior broke.

do $$
begin
  if to_regclass('public.artist_payouts') is not null then
    drop policy if exists artist_payouts_service_role_all on public.artist_payouts;
    drop policy if exists artist_payouts_owner_select on public.artist_payouts;
    alter table public.artist_payouts disable row level security;
    grant all on table public.artist_payouts to anon, authenticated, service_role;
  end if;

  if to_regclass('public.leaderboard_snapshots') is not null then
    drop policy if exists leaderboard_snapshots_service_role_all on public.leaderboard_snapshots;
    alter table public.leaderboard_snapshots disable row level security;
    grant all on table public.leaderboard_snapshots to anon, authenticated, service_role;
  end if;
end $$;
