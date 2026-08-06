-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- WEEKLY RITUALS v1 (additive) + economy in the daily pulse
-- ============================================================

-- Weekly champions: snapshot the leaderboard every Sunday into the existing
-- (empty) leaderboard_snapshots table, per community and overall.
create or replace function public.network_weekly_champions()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into leaderboard_snapshots (id, community_slug, fan_id, rank, points, snapshot_date)
  select gen_random_uuid(), '_network', f.id,
         row_number() over (order by f.total_points desc, f.created_at asc),
         f.total_points, current_date
  from fans f
  where coalesce(f.suspended,false) = false and f.total_points > 0
  order by f.total_points desc
  limit 25
  on conflict do nothing;

  -- propose the weekly recap moment (gated; Worker drafts it)
  insert into network_actions (action_type, ring, payload, reason, proposed_by, dedupe_key)
  values ('recap.weekly', 'gated',
          jsonb_build_object('week', to_char(now(), 'IYYY-IW')),
          'Weekly ritual: champions snapshot taken; fan-facing recap ready to draft',
          'concierge', 'recap:' || to_char(now(), 'IYYY-IW'))
  on conflict (dedupe_key) do nothing;
end $$;
revoke execute on function public.network_weekly_champions() from public, anon, authenticated;

-- Fold economy metrics into the daily brief
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
begin
  select count(*) into v_events_24h from fan_events where occurred_at > now() - interval '24 hours';
  select round(count(*)::numeric/7,1) into v_avg from fan_events
    where occurred_at between now() - interval '8 days' and now() - interval '24 hours';
  select count(*) into v_new_ids from network_identities where first_seen_at > now() - interval '24 hours';
  select count(*) into v_cross from (
    select network_id from network_identities group by network_id
    having count(distinct source_app) > 1) t;
  select count(*) into v_fraud from fraud_signals where created_at > now() - interval '24 hours';

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
    'computed_by', 'pg_cron'
  );

  v_summary := format(
    'Network pulse for %s: %s events in the last 24h (prior 7-day daily avg %s). '
    || '%s new identities; %s people recognized across more than one app. '
    || '%s fraud signals. %s streaks at risk, %s anniversaries within 7 days, '
    || '%s actions awaiting review. Points outstanding: %s; issued 24h: %s; spent 24h: %s; '
    || 'active rewards: %s (+%s brand perks). (Auto-computed; narrative pending agent run.)',
    current_date, v_events_24h, v_avg, v_new_ids, v_cross, v_fraud,
    v_metrics->>'streaks_at_risk', v_metrics->>'upcoming_anniversaries', v_metrics->>'pending_actions',
    v_metrics->'economy'->>'points_outstanding', v_metrics->'economy'->>'points_issued_24h',
    v_metrics->'economy'->>'points_spent_24h', v_metrics->'economy'->>'active_rewards',
    v_metrics->'economy'->>'active_brand_perks');

  insert into network_briefs (brief_date, metrics, summary)
  values (current_date, v_metrics, v_summary)
  on conflict (brief_date) do update
    set metrics = excluded.metrics,
        summary = case when network_briefs.summary like '%(Auto-computed%' or network_briefs.summary = ''
                       then excluded.summary else network_briefs.summary end,
        created_at = now();
end $$;

-- Schedule the weekly ritual: Sundays 04:50 UTC
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'network_weekly_champions';
exception when others then null;
end $$;
select cron.schedule('network_weekly_champions', '50 4 * * 0', $$select public.network_weekly_champions()$$);
