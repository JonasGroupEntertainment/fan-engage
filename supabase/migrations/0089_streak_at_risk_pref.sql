-- ────────────────────────────────────────────────────────────────────────────
-- 0089 — Streak reminders preference (Sprint 3 item A, 2026-10-29 audit)
--
-- Adds notification_preferences.notify_streak, the per-fan switch for the
-- hourly streak-at-risk push (app/api/cron/streak-at-risk, notification
-- type 'streak_at_risk', lib/notifications/preferences.ts). Default true,
-- like every other notify_* column: the global push_enabled switch is what
-- a fan who never opted in to push is gated by.
--
-- The table itself lives in prod with no migration in this repo; 0092
-- (out-of-band backfill) recreates it with `create table if not exists`.
-- Either order works: this file only adds a column, and 0092's create is a
-- no-op when the table already exists.
--
-- Idempotent. One statement — safe for the Supabase SQL editor.
-- Verify:
--   select column_name, column_default from information_schema.columns
--   where table_name = 'notification_preferences' and column_name = 'notify_streak';
-- ────────────────────────────────────────────────────────────────────────────

alter table public.notification_preferences
  add column if not exists notify_streak boolean not null default true;
