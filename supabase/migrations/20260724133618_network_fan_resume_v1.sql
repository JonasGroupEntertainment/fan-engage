-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- FAN RÉSUMÉ v1 (additive) — the verified passport data object.
-- Service-role only (contains per-fan history); the UI renders it,
-- the fan chooses to share it.
-- ============================================================
create or replace function public.network_fan_resume(p_fan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'fan', (select jsonb_build_object(
        'first_name', f.first_name,
        'last_initial', left(coalesce(f.last_name,''),1),
        'handle', f.handle,
        'tier', f.current_tier::text,
        'total_points', f.total_points,
        'current_streak_days', f.current_streak_days,
        'longest_streak_days', f.longest_streak_days,
        'joined_on', f.created_at::date,
        'member_for_days', (current_date - f.created_at::date))
      from fans f where f.id = p_fan_id),
    'network_cohort', (select jsonb_build_object(
        'arrival_rank', d.arrival_rank, 'cohort', d.cohort, 'arrived_at', d.arrived_at::date)
      from network_day_one d where d.hub_fan_id = p_fan_id and d.artist_slug = '_network'),
    'artist_cohorts', coalesce((select jsonb_agg(jsonb_build_object(
        'artist', d.artist_slug, 'arrival_rank', d.arrival_rank, 'cohort', d.cohort,
        'stage_at_arrival', d.stage_at_arrival, 'stage_now',
        (select stage from network_artist_stages s where s.artist_slug = d.artist_slug))
        order by d.arrival_rank)
      from network_day_one d where d.hub_fan_id = p_fan_id and d.artist_slug <> '_network'), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', fb.badge_slug, 'name', b.name, 'earned_at', fb.earned_at::date) order by fb.earned_at)
      from fan_badges fb left join badges b on b.slug = fb.badge_slug
      where fb.fan_id = p_fan_id), '[]'::jsonb),
    'activity', (select jsonb_object_agg(event_type, n) from (
        select event_type, count(*) n from fan_events
        where hub_fan_id = p_fan_id group by 1) t),
    'apps_present', coalesce((select jsonb_agg(distinct ni.source_app)
      from network_identities ni
      where ni.hub_fan_id = p_fan_id or ni.network_id in
        (select network_id from network_identities where hub_fan_id = p_fan_id)), '[]'::jsonb),
    'superfan_scores', coalesce((select jsonb_agg(jsonb_build_object(
        'artist', s.artist_slug, 'score', s.score))
      from network_superfan_scores s
      join network_identities ni on ni.network_id = s.network_id
      where ni.hub_fan_id = p_fan_id), '[]'::jsonb),
    'anniversaries', coalesce((select jsonb_agg(jsonb_build_object(
        'marker', anniversary_marker, 'date', anniversary_date))
      from fan_anniversary_log where fan_id = p_fan_id), '[]'::jsonb),
    'generated_at', now()
  ) into v;
  return v;
end $$;
revoke execute on function public.network_fan_resume(uuid) from public, anon, authenticated;
