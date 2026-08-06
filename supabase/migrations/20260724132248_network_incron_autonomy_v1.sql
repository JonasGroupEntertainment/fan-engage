-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- IN-DATABASE AUTONOMY v1 (additive) — pg_cron jobs that run with no
-- external dependencies: daily metrics brief + concierge proposals.
-- ============================================================
create extension if not exists pg_cron;

-- Daily pulse: compute metrics and write/refresh today's brief row.
-- A scheduled Claude agent may later overwrite `summary` with polished prose;
-- this guarantees a factual brief exists even if no agent runs.
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
    'computed_by', 'pg_cron'
  );

  v_summary := format(
    'Network pulse for %s: %s events in the last 24h (prior 7-day daily avg %s). '
    || '%s new identities; %s people now recognized across more than one app. '
    || '%s fraud signals. %s streaks at risk, %s anniversaries in the next 7 days, '
    || '%s actions awaiting review. (Auto-computed; narrative pending agent run.)',
    current_date, v_events_24h, v_avg, v_new_ids, v_cross, v_fraud,
    v_metrics->>'streaks_at_risk', v_metrics->>'upcoming_anniversaries', v_metrics->>'pending_actions');

  insert into network_briefs (brief_date, metrics, summary)
  values (current_date, v_metrics, v_summary)
  on conflict (brief_date) do update
    set metrics = excluded.metrics,
        summary = case when network_briefs.summary like '%(Auto-computed%' or network_briefs.summary = ''
                       then excluded.summary else network_briefs.summary end,
        created_at = now();
end $$;

-- Daily concierge: propose (never execute) fan-care actions with dedupe.
create or replace function public.network_concierge_propose()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into network_actions (action_type, ring, hub_fan_id, payload, reason, proposed_by, dedupe_key)
  select 'nudge.streak', 'gated', s.hub_fan_id,
         jsonb_build_object('streak_days', s.current_streak_days, 'tier', s.tier),
         format('%s-day streak ends today without activity', s.current_streak_days),
         'concierge',
         'streak:' || s.hub_fan_id || ':' || current_date
  from network_streaks_at_risk s
  on conflict (dedupe_key) do nothing;

  insert into network_actions (action_type, ring, hub_fan_id, payload, reason, proposed_by, dedupe_key)
  select 'note.anniversary', 'gated', a.hub_fan_id,
         jsonb_build_object('joined_on', a.joined_on, 'years', a.years),
         format('%s-year fan anniversary on %s', a.years, a.anniversary_md),
         'concierge',
         'anniv:' || a.hub_fan_id || ':' || date_part('year', now())
  from network_upcoming_anniversaries a
  on conflict (dedupe_key) do nothing;

  insert into network_actions (action_type, ring, hub_fan_id, network_id, artist_slug, payload, reason, proposed_by, dedupe_key)
  select 'winback.quiet_superfan', 'gated', q.hub_fan_id, q.network_id, q.artist_slug,
         jsonb_build_object('score', q.score, 'last_event_at', q.last_event_at),
         format('Superfan (score %s) inactive for 14+ days', q.score),
         'concierge',
         'quiet:' || q.network_id || ':' || to_char(now(), 'IYYY-IW')
  from network_quiet_superfans q
  on conflict (dedupe_key) do nothing;
end $$;

revoke execute on function public.network_compute_daily_brief() from public, anon, authenticated;
revoke execute on function public.network_concierge_propose() from public, anon, authenticated;

-- Schedule: brief at 04:30 UTC, concierge at 04:40 UTC daily (idempotent re-schedule)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('network_daily_brief','network_concierge');
exception when others then null;
end $$;
select cron.schedule('network_daily_brief', '30 4 * * *', $$select public.network_compute_daily_brief()$$);
select cron.schedule('network_concierge',   '40 4 * * *', $$select public.network_concierge_propose()$$);
