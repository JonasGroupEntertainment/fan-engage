-- Emergency rollback for migration 0040.
-- This restores the prior access posture and should be used only while fixing
-- a verified production regression.

drop policy if exists artist_payouts_admin_read on public.artist_payouts;
alter table public.artist_payouts disable row level security;
alter table public.leaderboard_snapshots disable row level security;
