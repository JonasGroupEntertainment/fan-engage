-- 0107_badge_points_own_source.sql
--
-- Applied to production on 2026-11-22 (ledger version 20261122232048),
-- after 0106 in its own run. Checked after: 1,621 rows renamed to 'badge',
-- 22 rows moved to 'daily_drop', 6 rows left as 'manual_adjustment', and
-- the sums of the ledger, fans.total_points and membership points did not
-- change.
--
-- Port of Brand Engage Pro 0121, without its brand retag (every badge row
-- here already names raelynn).
--
-- 1. award_community_badge now asks apply_points_award for source 'badge'
--    (added in 0106), not 'manual_adjustment'. That one word is the only
--    change to the function; the body is otherwise the 0100 version. The
--    amount, the multiplier, the once-only guards and the notification
--    are the same. apply_points_award falls back to 'manual_adjustment'
--    for a source it does not know, so this function is safe even on a
--    database where 0106 has not run.
--
-- 2. Existing badge rows take the new name (1,621 rows on 2026-11-22).
--
-- 3. Daily drop rows written before 0065 gave daily drops their own
--    source were left as 'manual_adjustment' (22 rows on 2026-11-22).
--    They move to 'daily_drop'. The daily drop code finds a claim by
--    source_ref alone (frontend/lib/drops/daily-drop.ts), so it reads
--    these rows the same before and after.
--
-- After this, 'manual_adjustment' holds test grants and one streak
-- milestone (6 rows on 2026-11-22), and from now on only balances a
-- person changed by hand plus streak milestones
-- (frontend/lib/streaks/touch.ts, which has no source of its own).
--
-- No balance changes: only the source label on existing rows. The ledger
-- has no unique index that includes source except the referral one, which
-- these rows cannot match. network_publish_points fires on INSERT only,
-- so the updates send nothing to the network.

create or replace function public.award_community_badge(p_fan_id uuid, p_slug text, p_community_id text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_points   integer;
  v_awarded  integer := 0;
  v_name     text;
  v_icon     text;
  v_ref      text;
  v_inserted boolean;
begin
  insert into fan_badges (fan_id, badge_slug, community_id)
  values (p_fan_id, p_slug, p_community_id)
  on conflict (fan_id, badge_slug, community_id) do nothing
  returning true into v_inserted;

  if v_inserted is null then return false; end if;

  select point_value, name, icon into v_points, v_name, v_icon
    from badges where slug = p_slug;

  if coalesce(v_points, 0) > 0 then
    v_ref := 'badge:' || p_slug || ':' || p_community_id || ':' || p_fan_id::text;
    v_awarded := public.apply_points_award(
      p_fan_id,
      v_points,
      'badge',
      v_ref,
      p_community_id,
      'Badge earned: ' || p_slug || ' (' || p_community_id || ')'
    );
  end if;

  perform upsert_notification(
    p_fan_id,
    'badge_earned',
    coalesce(v_name, 'Badge earned'),
    case when coalesce(v_awarded, 0) > 0
         then 'You earned ' || v_awarded || ' bonus points.'
         else 'You unlocked a new badge.' end,
    '/rewards',
    v_icon,
    'badge:' || p_slug || ':' || p_community_id,
    p_community_id
  );

  return true;
end $function$;

-- Backfill 1: existing badge points take the new name.
update public.points_ledger
   set source = 'badge'
 where source = 'manual_adjustment'
   and source_ref like 'badge:%';

-- Backfill 2: daily drops from before 0065 take the daily drop name.
update public.points_ledger
   set source = 'daily_drop'
 where source = 'manual_adjustment'
   and source_ref like 'daily-drop:%';
