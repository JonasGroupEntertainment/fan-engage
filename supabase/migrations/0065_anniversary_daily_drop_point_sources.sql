-- Already applied to production via MCP on 2026-09-27.
--
-- 0065_anniversary_daily_drop_point_sources.sql
--
-- Anniversary awards and daily drops wrote points with the sources
-- 'anniversary' and 'daily_drop', and neither was ever in the point_source
-- enum. Anniversary ledger inserts failed silently, so the fans.total_points
-- bump had no ledger row behind it and the next sync wiped it. Daily drops
-- went through apply_points_award(), which filed them as manual_adjustment,
-- so the "already claimed" lookup by source never matched.
--
-- Both paths now go through apply_points_award(). This adds the two enum
-- values so the rows are labelled correctly.
--
-- Enum values go in their own migration: Postgres cannot use a new enum
-- value in the same transaction that adds it. Idempotent via IF NOT EXISTS.

alter type point_source add value if not exists 'anniversary';
alter type point_source add value if not exists 'daily_drop';
