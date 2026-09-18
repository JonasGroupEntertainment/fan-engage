-- Rollback for 0060_artist_payouts_owner_read.sql.
-- Drops the owner-read policy and restores the broad grants that existed
-- before. RLS stays enabled (it was enabled by 20260713111819, not by 0060).
-- The 0049 artist_payouts_admin_read policy is not recreated: it was never
-- live in production, and pre-0060 production had no policies on this table.

drop policy if exists artist_payouts_owner_read on public.artist_payouts;

grant all on table public.artist_payouts to anon, authenticated, service_role;
