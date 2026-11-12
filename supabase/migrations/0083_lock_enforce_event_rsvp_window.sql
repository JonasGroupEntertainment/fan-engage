-- 0083_lock_enforce_event_rsvp_window.sql
--
-- Follow-up to 0079. public.enforce_event_rsvp_window() is already
-- SECURITY DEFINER with a fixed search_path, but 0079 left the Postgres
-- default EXECUTE grant to PUBLIC in place. 0078 locked the points
-- functions (apply_points_award, award_event_rsvp_points, and the other
-- writers) by revoking that grant. This applies the same lock to the
-- RSVP window check.
--
-- Numbered 0083. 0080 is supabase/migrations/0080_fan_reengagement_emails.sql
-- on open PR #122. 0081 and 0082 are already on main.
--
-- Direct calls only. Postgres does not check EXECUTE when trigger
-- event_rsvps_enforce_rsvp_window fires, so inserts keep working.
-- No app code calls this function through rpc().
--
-- EXECUTE stays with service_role only, the same role 0078 keeps for
-- the points functions. public, anon, and authenticated lose it.
--
-- Idempotent: REVOKE and GRANT succeed when re-run.
-- Requires 0079_founding_rsvp_window.sql first (the function must exist).
-- NOT applied. Do not run this against production from an agent.
-- Apply by hand in the Supabase SQL editor, one statement at a time,
-- in order. Fan Engage project: uhovonrljcauaoctypbg.
-- The SQL editor drops later statements in a multi-statement paste.

-- Statement 1
revoke execute on function public.enforce_event_rsvp_window()
  from public, anon, authenticated;

-- Statement 2
grant execute on function public.enforce_event_rsvp_window()
  to service_role;
