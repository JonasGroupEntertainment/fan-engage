-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Historical single-tenant era: every ledger row without a community
-- belongs to raelynn. Going forward awardPoints stamps community_id.
update public.points_ledger set community_id = 'raelynn' where community_id is null;
