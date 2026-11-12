-- 0081_imported_fan_raelynn_membership.sql
--
-- Backfill RaeLynn fan_community_memberships for the 18 Jun 2026 admin
-- import (commits 150da88, 21a2e98) and any later import stamped
-- app_metadata.fan_import. That import created email-confirmed auth users
-- and fans rows, and no community membership. The fans never chose a
-- password (GoTrue stored a random hash) and last_sign_in_at is null.
--
-- One statement. Idempotent: ON CONFLICT DO NOTHING.
-- Does not assign founding fan numbers. Existing membership rows are left alone.
--
-- NOT applied. Apply manually in the Supabase SQL editor, one statement at a time.
-- Do not run this from an agent or a migration runner.
-- Fan Engage project: uhovonrljcauaoctypbg.

insert into public.fan_community_memberships (
  fan_id,
  community_id,
  joined_at,
  total_points,
  current_tier,
  status
)
select
  u.id,
  'raelynn',
  u.created_at,
  0,
  'bronze',
  'active'
from auth.users u
join public.fans f on f.id = u.id
where u.email_confirmed_at is not null
  and (
    coalesce(u.raw_app_meta_data->>'fan_import', '') in ('true', 't')
    or (
      u.confirmation_sent_at is null
      and u.invited_at is null
      and coalesce(u.raw_app_meta_data->>'provider', '') = 'email'
      and u.raw_user_meta_data = '{"email_verified": true}'::jsonb
    )
  )
on conflict (fan_id, community_id) do nothing;
