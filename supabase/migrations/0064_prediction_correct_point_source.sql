-- 0064_prediction_correct_point_source.sql
--
-- Prediction payouts wrote points_ledger rows with source
-- 'prediction_correct', which was never added to the point_source enum.
-- Every one of those inserts failed, and the error was ignored, so winners
-- got a fans.total_points bump with no ledger row behind it. The next
-- sync_points_from_ledger() would then wipe those points out.
--
-- resolve.ts now pays through apply_points_award(). This adds the enum
-- value so those rows are labelled correctly. (Without it,
-- apply_points_award() still works but files them as manual_adjustment.)
--
-- Enum values go in their own migration: Postgres cannot use a new enum
-- value in the same transaction that adds it.
--
-- Prod check 2026-09-27: prediction_award_log has 0 rows, so nothing needs
-- a backfill.

alter type point_source add value if not exists 'prediction_correct';
