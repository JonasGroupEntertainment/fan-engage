-- OPT-IN. Not a migration. Not applied on deploy. Not run by the
-- founding-multiplier change.
--
-- Past points stay as they were. Run this only if Kevin wants founding
-- fans paid the missing half on earlier earns. 0078 must already be
-- applied, because APPLY writes points_ledger.multiplier.
--
-- The Supabase SQL editor drops every statement after the first in a
-- paste. Pasting this file runs PREVIEW only.
--
-- PREVIEW lists one row per un-multiplied earn. gap is the points APPLY
-- would add: round(delta * 1.5) - delta. Rows whose note already says
-- 1.5 were already multiplied and are omitted. Spends, refunds, and
-- notes containing "test" are omitted.
--
-- APPLY inserts one manual_adjustment per preview row, source_ref
-- founding-mult-backfill:<original id>, then resyncs those fans from
-- the ledger. A second run finds the source_ref and inserts nothing.

-- ─── PREVIEW (run this statement alone) ──────────────────────────────────
select
  l.id,
  l.fan_id,
  l.community_id,
  m.founding_fan_number,
  l.source,
  l.delta as base_delta,
  round(l.delta * 1.5)::integer - l.delta as gap,
  left(l.note, 80) as note,
  l.created_at
from public.points_ledger l
join public.fan_community_memberships m
  on m.fan_id = l.fan_id
 and m.community_id = l.community_id
where m.founding_fan_number is not null
  and m.founding_fan_number >= 1
  and l.delta > 0
  and l.source <> 'reward_redemption'
  and coalesce(l.note, '') not ilike '%1.5%'
  and coalesce(l.note, '') not ilike '%test%'
  and coalesce(l.source_ref, '') not like 'founding-mult-backfill:%'
  and (
    l.source in (
      'signup_bonus', 'daily_checkin', 'challenge', 'event_rsvp',
      'referral', 'social_share', 'anniversary', 'daily_drop',
      'prediction_correct', 'presave', 'radio_support', 'purchase'
    )
    or (
      l.source = 'manual_adjustment'
      and (
        l.note ilike 'Badge earned:%'
        or l.note ilike 'Daily drop%'
        or l.note ilike 'Streak milestone:%'
      )
    )
  )
  and not exists (
    select 1
      from public.points_ledger done
     where done.source_ref = 'founding-mult-backfill:' || l.id::text
  )
order by l.created_at;

-- ─── APPLY (its own paste, only after reading PREVIEW) ───────────────────
-- do $$
-- declare
--   r record;
-- begin
--   for r in
--     select l.id, l.fan_id, l.community_id, l.delta, l.note
--       from public.points_ledger l
--       join public.fan_community_memberships m
--         on m.fan_id = l.fan_id
--        and m.community_id = l.community_id
--      where m.founding_fan_number is not null
--        and m.founding_fan_number >= 1
--        and l.delta > 0
--        and l.source <> 'reward_redemption'
--        and coalesce(l.note, '') not ilike '%1.5%'
--        and coalesce(l.note, '') not ilike '%test%'
--        and (
--          l.source in (
--            'signup_bonus', 'daily_checkin', 'challenge', 'event_rsvp',
--            'referral', 'social_share', 'anniversary', 'daily_drop',
--            'prediction_correct', 'presave', 'radio_support', 'purchase'
--          )
--          or (
--            l.source = 'manual_adjustment'
--            and (
--              l.note ilike 'Badge earned:%'
--              or l.note ilike 'Daily drop%'
--              or l.note ilike 'Streak milestone:%'
--            )
--          )
--        )
--        and not exists (
--          select 1
--            from public.points_ledger done
--           where done.source_ref = 'founding-mult-backfill:' || l.id::text
--        )
--        and round(l.delta * 1.5)::integer > l.delta
--   loop
--     insert into public.points_ledger (
--       fan_id, delta, source, source_ref, community_id, note, multiplier
--     ) values (
--       r.fan_id,
--       round(r.delta * 1.5)::integer - r.delta,
--       'manual_adjustment',
--       'founding-mult-backfill:' || r.id::text,
--       r.community_id,
--       'Founding Fan 1.5x backfill',
--       1.5
--     );
--     perform public.sync_points_from_ledger(r.fan_id);
--   end loop;
-- end $$;
