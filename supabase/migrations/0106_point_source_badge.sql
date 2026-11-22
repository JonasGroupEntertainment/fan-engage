-- 0106_point_source_badge.sql
--
-- Applied to production on 2026-11-22 (ledger version 20261122232032).
--
-- Adds 'badge' to the point_source enum so badge bonus points can be told
-- apart from true hand adjustments. Port of Brand Engage Pro 0120.
--
-- A prod check on 2026-11-22 found 1,649 'manual_adjustment' rows, of
-- which 1,621 were automatic badge bonuses and none was a hand adjustment
-- for a real fan (Kevin, 2026-11-22: give badge points their own name).
--
-- This file only adds the value. Postgres cannot use a new enum value in
-- the transaction that adds it, so the function change and the backfill
-- are in 0107.

alter type public.point_source add value if not exists 'badge';
