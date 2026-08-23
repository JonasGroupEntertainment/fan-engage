-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — revoke anon EXECUTE on remaining SECURITY DEFINER RPCs
--
-- Dash's FE final audit (read-only) found prod still grants PUBLIC/anon
-- EXECUTE (Postgres default) on:
--   public.auto_grant_super_admin
--   public.apply_moderation_decision
--   public.award_badge
--
-- apply_points_award and redeem_reward are already anon-blocked
-- (0050 / 0053 — FE #15 / #21). This migration does not touch those.
--
-- Call sites (least privilege):
--   auto_grant_super_admin     trigger on auth.users only — no TS RPC
--   apply_moderation_decision  createAdminClient() / service_role only
--   award_badge                SECURITY DEFINER triggers only; TS uses
--                              award_community_badge via service_role
--
-- Safe to re-run (idempotent).
-- Apply via: Supabase SQL editor, or this file in supabase/migrations.
-- ────────────────────────────────────────────────────────────────────────────

-- Trigger-only. Session roles must not call this via PostgREST.
revoke all on function public.auto_grant_super_admin() from public, anon, authenticated;
grant execute on function public.auto_grant_super_admin() to postgres, service_role;

-- Admin/classifier path uses the service-role client only (0025 already
-- granted service_role; PUBLIC default execute was never revoked).
revoke all on function public.apply_moderation_decision(
  text, uuid, text, uuid, text, smallint, text[], text, boolean, text, text, text
) from public, anon, authenticated;
grant execute on function public.apply_moderation_decision(
  text, uuid, text, uuid, text, smallint, text[], text, boolean, text, text, text
) to service_role;

-- Trigger shim. No frontend rpc("award_badge") callers.
revoke all on function public.award_badge(uuid, text) from public, anon, authenticated;
grant execute on function public.award_badge(uuid, text) to postgres, service_role;
