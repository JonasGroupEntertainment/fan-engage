-- Rollback for 0047_flagged_table_rls.sql.
-- Use only if the production verification shows approved behavior broke.

drop policy if exists artist_payouts_owner_read on public.artist_payouts;

alter table public.artist_payouts disable row level security;
alter table public.leaderboard_snapshots disable row level security;
