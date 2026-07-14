-- Close two service-managed tables that were created without RLS.
-- Service-role cron jobs continue to bypass RLS. Authenticated users receive
-- only the minimum read access needed for an artist administrator to inspect
-- their own community's payout ledger. Leaderboard snapshots remain private.

alter table public.artist_payouts enable row level security;
alter table public.leaderboard_snapshots enable row level security;

drop policy if exists artist_payouts_admin_read on public.artist_payouts;
create policy artist_payouts_admin_read
  on public.artist_payouts
  for select
  to authenticated
  using (public.is_admin_of(community_slug));

comment on table public.leaderboard_snapshots is
  'Service-managed daily ranking snapshots. RLS intentionally exposes no client policies.';
