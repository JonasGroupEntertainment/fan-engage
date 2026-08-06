-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Command layer: read surface for the operational/vision apps (JG Operating System, JG Advisors).
-- Mirrors network_agent_pull's key-gated pattern but shaped for planning, not narration.

create or replace function network_command_pull(p_api_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app text;
  v_result jsonb;
begin
  select app_name into v_app from network_publishers where api_key = p_api_key and enabled = true;
  if v_app is null then
    raise exception 'invalid or disabled publisher key';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'latest_brief', (select jsonb_build_object('brief_date', brief_date, 'summary', summary, 'metrics', metrics) from network_briefs order by brief_date desc limit 1),
    'latest_retro', (select jsonb_build_object('week', week, 'summary', summary, 'findings', findings) from network_retros order by week desc limit 1),
    'economy', network_economy_metrics(),
    'launch_plan', (select coalesce(jsonb_agg(row_to_json(lp) order by lp.target_date nulls last), '[]'::jsonb) from network_launch_plan lp),
    'trust_policy', (select coalesce(jsonb_agg(row_to_json(tp) order by tp.category, tp.action_type), '[]'::jsonb) from network_trust_policy tp),
    'pending_actions', (
      select coalesce(jsonb_agg(jsonb_build_object('action_type', action_type, 'status', status, 'count', cnt)), '[]'::jsonb)
      from (
        select action_type, status, count(*) as cnt
        from network_actions
        where status in ('proposed','drafted')
        group by action_type, status
      ) s
    ),
    'recent_alerts', (
      select coalesce(jsonb_agg(jsonb_build_object('action_type', action_type, 'reason', reason, 'status', status, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
      from (
        select * from network_actions
        where action_type in ('alert.feeder_silent','alert.fraud_spike','alert.event_flood','alert.cron_failure','trust.level_changed')
        order by created_at desc
        limit 15
      ) r
    ),
    'artist_stages', (
      select coalesce(jsonb_agg(jsonb_build_object('artist_slug', artist_slug, 'stage', stage, 'stage_since', stage_since) order by artist_slug), '[]'::jsonb)
      from network_artist_stages
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function network_command_pull(uuid) from public;
grant execute on function network_command_pull(uuid) to anon, authenticated;

-- Render-ready artist journey timeline — the data source for a "Garage to the Stadium" feature
-- panel living inside Fan Engage Pro itself, rather than a standalone deployed app.
create or replace function network_stage_journey(p_artist_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'artist_slug', p_artist_slug,
    'current_stage', (select stage from network_artist_stages where artist_slug = p_artist_slug),
    'stage_since', (select stage_since from network_artist_stages where artist_slug = p_artist_slug),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'effective_from', effective_from) order by effective_from asc), '[]'::jsonb)
      from network_artist_stage_history
      where artist_slug = p_artist_slug
    ),
    'day_one_counts', (
      select coalesce(jsonb_object_agg(cohort, cnt), '{}'::jsonb) from (
        select cohort, count(*) cnt from network_day_one where artist_slug = p_artist_slug group by cohort
      ) c
    )
  );
$$;

revoke all on function network_stage_journey(text) from public;
grant execute on function network_stage_journey(text) to anon, authenticated;

-- Register the command-layer consumer as a publisher (key-gated read access via network_command_pull).
insert into network_publishers (app_name, enabled)
values ('jg_operating_system', true)
on conflict (app_name) do nothing;

