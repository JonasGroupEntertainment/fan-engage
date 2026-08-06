-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Go-live scope: RaeLynn only. Dan Marshall, Danger Twins, and Hunter Hawkins
-- are deactivated (not deleted) until RaeLynn is launched, at which point
-- additional artists get re-activated one at a time.
update public.artists
set active = false
where slug in ('dan-marshall', 'danger-twins', 'hunter-hawkins');
