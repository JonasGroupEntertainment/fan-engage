-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Add launch countdown to the daily pulse
create or replace function public.network_compute_daily_brief()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_metrics jsonb;
  v_summary text;
  v_events_24h bigint;
  v_avg numeric;
  v_new_ids bigint;
  v_cross bigint;
  v_fraud bigint;
  v_next_launch text;
begin
  select count(*) into v_events_24h from fan_events where occurred_at > now() - interval '24 hours';
  select round(count(*)::numeric/7,1) into v_avg from fan_events
    where occurred_at between now() - interval '8 days' and now() - interval '24 hours';
  select count(*) into v_new_ids from network_identities where first_seen_at > now() - interval '24 hours';
  select count(*) into v_cross from (
    select network_id from network_identities group by network_id
    having count(distinct source_app) > 1) t;
  select count(*) into v_fraud from fraud_signals where created_at > now() - interval '24 hours';

  select coalesce(string_agg(
           artist_slug || case when target_date is not null
             then ' in ' || (target_date - current_date) || 'd' else ' (' || launch_window || ')' end,
           ', ' order by target_date nulls last, artist_slug), 'none scheduled')
  into v_next_launch
  from network_launch_plan where status = 'planned';

  v_metrics := jsonb_build_object(
    'events_24h', v_events_24h,
    'events_prior_7d_daily_avg', v_avg,
    'by_type_24h', coalesce((select jsonb_object_agg(event_type, n) from (
        select event_type, count(*) n from fan_events
        where occurred_at > now() - interval '24 hours' group by 1) t), '{}'::jsonb),
    'by_app_24h', coalesce((select jsonb_object_agg(source_app, n) from (
        select source_app, count(*) n from fan_events
        where occurred_at > now() - interval '24 hours' group by 1) t), '{}'::jsonb),
    'per_artist_24h', coalesce((select jsonb_object_agg(artist_slug, n) from (
        select artist_slug, count(*) n from fan_events
        where occurred_at > now() - interval '24 hours' and artist_slug is not null group by 1) t), '{}'::jsonb),
    'identities_total', (select count(*) from network_identities),
    'identities_new_24h', v_new_ids,
    'cross_app_people', v_cross,
    'fraud_signals_24h', v_fraud,
    'streaks_at_risk', (select count(*) from network_streaks_at_risk),
    'upcoming_anniversaries', (select count(*) from network_upcoming_anniversaries),
    'pending_actions', (select count(*) from network_actions where status in ('proposed','drafted')),
    'day_one_stamped_total', (select count(*) from network_day_one),
    'economy', public.network_economy_metrics(),
    'launch_plan', coalesce((select jsonb_agg(jsonb_build_object(
        'who', artist_slug, 'platform', platform, 'window', launch_window,
        'target_date', target_date, 'status', status))
      from network_launch_plan), '[]'::jsonb),
    'computed_by', 'pg_cron'
  );

  v_summary := format(
    'Network pulse for %s: %s events in the last 24h (prior 7-day daily avg %s). '
    || '%s new identities; %s people recognized across more than one app. '
    || '%s fraud signals. %s streaks at risk, %s anniversaries within 7 days, '
    || '%s actions awaiting review. Points outstanding: %s; issued 24h: %s; spent 24h: %s; '
    || 'active rewards: %s (+%s brand perks). Launch runway: %s. '
    || '(Auto-computed; narrative pending agent run.)',
    current_date, v_events_24h, v_avg, v_new_ids, v_cross, v_fraud,
    v_metrics->>'streaks_at_risk', v_metrics->>'upcoming_anniversaries', v_metrics->>'pending_actions',
    v_metrics->'economy'->>'points_outstanding', v_metrics->'economy'->>'points_issued_24h',
    v_metrics->'economy'->>'points_spent_24h', v_metrics->'economy'->>'active_rewards',
    v_metrics->'economy'->>'active_brand_perks', v_next_launch);

  insert into network_briefs (brief_date, metrics, summary)
  values (current_date, v_metrics, v_summary)
  on conflict (brief_date) do update
    set metrics = excluded.metrics,
        summary = case when network_briefs.summary like '%(Auto-computed%' or network_briefs.summary = ''
                       then excluded.summary else network_briefs.summary end,
        created_at = now();
end $$;

select public.network_compute_daily_brief();
