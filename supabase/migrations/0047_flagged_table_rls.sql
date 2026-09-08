-- Kevin-approved app-access security remediation, 2026-07-14.
-- Close the two flagged Fan Engage tables with least-privilege RLS.
-- Cron routes continue using the server-side Supabase service role.

alter table public.artist_payouts enable row level security;
alter table public.leaderboard_snapshots enable row level security;

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

-- leaderboard_snapshots is an internal notification diff table. No anon or
-- authenticated direct policies are granted; service_role cron bypasses RLS.

grant all on public.artist_payouts to service_role;
grant all on public.leaderboard_snapshots to service_role;
