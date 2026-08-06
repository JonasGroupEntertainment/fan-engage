-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Go-live scope: RaeLynn only. Denise Jonas and Franklin Jonas are deactivated
-- (not deleted) for now, joining the other paused pilots.
update public.artists
set active = false
where slug in ('denise-jonas', 'franklin-jonas');
