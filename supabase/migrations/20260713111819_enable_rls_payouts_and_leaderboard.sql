-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- artist_payouts: Stripe transfer ledger, written server-side only. Lock the
-- browser key out entirely (service role still has full access).
alter table public.artist_payouts enable row level security;

-- leaderboard_snapshots: displayed to signed-in fans, so allow read; writes
-- stay server-side via the service role.
alter table public.leaderboard_snapshots enable row level security;
create policy "leaderboard readable by signed-in fans"
  on public.leaderboard_snapshots for select
  to authenticated using (true);
