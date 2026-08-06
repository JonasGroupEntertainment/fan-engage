-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- WATCHDOG v1 (additive) — hourly in-DB sentinel.
-- Files 'free'-ring alert proposals (observations, nothing fan-visible).
-- ============================================================
create or replace function public.network_watchdog()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_hourly_avg numeric; v_last_hour bigint; v_fraud bigint;
begin
  -- 1) Feeder silence: publishers averaging >=1 event/day over the prior 7d,
  --    but silent for 48h
  for r in
    select source_app, max(occurred_at) as last_event, count(*) as events_7d
    from fan_events
    where occurred_at > now() - interval '9 days'
    group by source_app
    having count(*) >= 7 and max(occurred_at) < now() - interval '48 hours'
  loop
    insert into network_actions (action_type, ring, payload, reason, proposed_by, dedupe_key)
    values ('alert.feeder_silent', 'free',
            jsonb_build_object('source_app', r.source_app, 'last_event', r.last_event, 'events_prior_7d', r.events_7d),
            format('Feeder %s has been silent for 48h+ after averaging >=1 event/day — possible outage', r.source_app),
            'watchdog', 'silent:' || r.source_app || ':' || current_date)
    on conflict (dedupe_key) do nothing;
  end loop;

  -- 2) Fraud spike
  select count(*) into v_fraud from fraud_signals where created_at > now() - interval '1 hour';
  if v_fraud >= 5 then
    insert into network_actions (action_type, ring, payload, reason, proposed_by, dedupe_key)
    values ('alert.fraud_spike', 'free',
            jsonb_build_object('signals_last_hour', v_fraud),
            format('%s fraud signals in the last hour', v_fraud),
            'watchdog', 'fraud:' || to_char(now(),'YYYY-MM-DD-HH24'))
    on conflict (dedupe_key) do nothing;
  end if;

  -- 3) Event flood: last hour >50x trailing hourly average AND >500 events
  select count(*) into v_last_hour from fan_events where occurred_at > now() - interval '1 hour';
  select greatest(count(*)::numeric / (24*7), 0.1) into v_hourly_avg
  from fan_events where occurred_at between now() - interval '8 days' and now() - interval '1 day';
  if v_last_hour > 500 and v_last_hour > 50 * v_hourly_avg then
    insert into network_actions (action_type, ring, payload, reason, proposed_by, dedupe_key)
    values ('alert.event_flood', 'free',
            jsonb_build_object('events_last_hour', v_last_hour, 'trailing_hourly_avg', round(v_hourly_avg,1)),
            format('Event flood: %s events in the last hour vs %s/hr trailing average — possible bot activity or runaway feeder', v_last_hour, round(v_hourly_avg,1)),
            'watchdog', 'flood:' || to_char(now(),'YYYY-MM-DD-HH24'))
    on conflict (dedupe_key) do nothing;
  end if;

  -- 4) Cron job failures in the last 2 hours
  for r in
    select j.jobname, d.status, d.return_message, max(d.end_time) as failed_at
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where d.status = 'failed' and d.end_time > now() - interval '2 hours'
    group by j.jobname, d.status, d.return_message
  loop
    insert into network_actions (action_type, ring, payload, reason, proposed_by, dedupe_key)
    values ('alert.cron_failure', 'free',
            jsonb_build_object('job', r.jobname, 'message', left(r.return_message, 300), 'failed_at', r.failed_at),
            format('Scheduled job %s failed: %s', r.jobname, left(r.return_message, 120)),
            'watchdog', 'cronfail:' || r.jobname || ':' || current_date)
    on conflict (dedupe_key) do nothing;
  end loop;
end $$;
revoke execute on function public.network_watchdog() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'network_watchdog';
exception when others then null;
end $$;
select cron.schedule('network_watchdog', '5 * * * *', $$select public.network_watchdog()$$);

-- Run once now to validate
select public.network_watchdog();
