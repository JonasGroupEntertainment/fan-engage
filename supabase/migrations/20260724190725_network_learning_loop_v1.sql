-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- LEARNING LOOP v1 (additive)
-- Outcomes on actions + daily measurement + weekly retrospective.
-- ============================================================

alter table public.network_actions
  add column if not exists outcome text
    check (outcome in ('success','partial','no_response','unmeasurable')),
  add column if not exists outcome_detail jsonb,
  add column if not exists outcome_measured_at timestamptz;

-- Measure outcomes for executed actions past their observation window
create or replace function public.network_measure_outcomes()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_active boolean; v_streak_now int; v_events bigint;
begin
  for r in
    select * from network_actions
    where status = 'executed' and outcome is null
      and executed_at < now() - interval '48 hours'
  loop
    if r.action_type = 'nudge.streak' and r.hub_fan_id is not null then
      -- did the fan act within 48h of execution (streak saved)?
      select count(*) > 0 into v_active from fan_events
        where hub_fan_id = r.hub_fan_id
          and occurred_at between r.executed_at and r.executed_at + interval '48 hours';
      select current_streak_days into v_streak_now from fans where id = r.hub_fan_id;
      update network_actions set
        outcome = case when v_active then 'success' else 'no_response' end,
        outcome_detail = jsonb_build_object('responded_48h', v_active, 'streak_now', v_streak_now),
        outcome_measured_at = now()
      where id = r.id;

    elsif r.action_type in ('note.anniversary','winback.quiet_superfan') and r.hub_fan_id is not null then
      -- observation window: 7 days
      if r.executed_at < now() - interval '7 days' then
        select count(*) into v_events from fan_events
          where hub_fan_id = r.hub_fan_id
            and occurred_at between r.executed_at and r.executed_at + interval '7 days';
        update network_actions set
          outcome = case when v_events >= 3 then 'success'
                         when v_events >= 1 then 'partial'
                         else 'no_response' end,
          outcome_detail = jsonb_build_object('events_7d', v_events),
          outcome_measured_at = now()
        where id = r.id;
      end if;

    elsif r.action_type in ('moment.draft','moment.launch','recap.weekly') then
      -- measure engagement in the artist's slice for 7 days after
      if r.executed_at < now() - interval '7 days' then
        select count(*) into v_events from fan_events
          where (r.artist_slug is null or artist_slug = r.artist_slug)
            and occurred_at between r.executed_at and r.executed_at + interval '7 days';
        update network_actions set
          outcome = case when v_events > 0 then 'success' else 'no_response' end,
          outcome_detail = jsonb_build_object('events_7d_after', v_events),
          outcome_measured_at = now()
        where id = r.id;
      end if;

    else
      update network_actions set outcome = 'unmeasurable', outcome_measured_at = now()
      where id = r.id and executed_at < now() - interval '7 days';
    end if;
  end loop;
end $$;
revoke execute on function public.network_measure_outcomes() from public, anon, authenticated;

-- Weekly retrospective: the evidence table agents will read before proposing
create table if not exists public.network_retros (
  week text primary key,
  findings jsonb not null,
  summary text not null,
  created_at timestamptz not null default now()
);
alter table public.network_retros enable row level security;

create or replace function public.network_weekly_retro()
returns void language plpgsql security definer set search_path = public as $$
declare v_findings jsonb; v_summary text;
begin
  select coalesce(jsonb_object_agg(action_type, stats), '{}'::jsonb) into v_findings
  from (
    select action_type, jsonb_build_object(
      'proposed', count(*) filter (where status in ('proposed','drafted','approved','rejected','executed','expired')),
      'approved', count(*) filter (where status in ('approved','executed')),
      'rejected', count(*) filter (where status = 'rejected'),
      'executed', count(*) filter (where status = 'executed'),
      'success',  count(*) filter (where outcome = 'success'),
      'partial',  count(*) filter (where outcome = 'partial'),
      'no_response', count(*) filter (where outcome = 'no_response'),
      'success_rate', case when count(*) filter (where outcome in ('success','partial','no_response')) > 0
        then round(100.0 * count(*) filter (where outcome = 'success')
             / count(*) filter (where outcome in ('success','partial','no_response')))
        else null end
    ) as stats
    from network_actions
    group by action_type
  ) t;

  v_summary := format('Retro %s: %s action types tracked. Approval + outcome stats in findings; agents should weight future proposals toward types with higher success_rate and drop types repeatedly rejected.',
    to_char(now(),'IYYY-IW'), (select count(*) from jsonb_object_keys(v_findings)));

  insert into network_retros (week, findings, summary)
  values (to_char(now(),'IYYY-IW'), v_findings, v_summary)
  on conflict (week) do update set findings = excluded.findings, summary = excluded.summary, created_at = now();
end $$;
revoke execute on function public.network_weekly_retro() from public, anon, authenticated;

-- Schedules: measure daily 04:25 (before the brief), retro Sundays 05:00
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('network_outcomes','network_weekly_retro');
exception when others then null;
end $$;
select cron.schedule('network_outcomes', '25 4 * * *', $$select public.network_measure_outcomes()$$);
select cron.schedule('network_weekly_retro', '0 5 * * 0', $$select public.network_weekly_retro()$$);
