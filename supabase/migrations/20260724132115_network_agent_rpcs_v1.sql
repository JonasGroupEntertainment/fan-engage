-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- AGENT ACCESS RPCs v1 — connector-independent doorway for scheduled agents.
-- Plain HTTPS + anon key + per-agent api_key. Agents can READ the pulse and
-- SUBMIT briefs/proposals/drafts. They can NEVER approve, execute, or delete.
-- ============================================================

create or replace function public.network_agent_pull(p_api_key uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app text;
  v_out jsonb;
begin
  select app_name into v_app from network_publishers where api_key = p_api_key and enabled;
  if v_app is null then
    raise exception 'invalid agent key' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'agent', v_app,
    'generated_at', now(),
    'events_24h', coalesce((
       select jsonb_agg(jsonb_build_object('event_type', event_type, 'source_app', source_app, 'n', n))
       from (select event_type, source_app, count(*) n from fan_events
             where occurred_at > now() - interval '24 hours'
             group by 1,2 order by n desc limit 30) t), '[]'::jsonb),
    'events_prior_7d_daily_avg', coalesce((
       select round(count(*)::numeric / 7, 1) from fan_events
       where occurred_at between now() - interval '8 days' and now() - interval '24 hours'), 0),
    'per_artist_24h', coalesce((
       select jsonb_agg(jsonb_build_object('artist', artist_slug, 'n', n))
       from (select artist_slug, count(*) n from fan_events
             where occurred_at > now() - interval '24 hours' and artist_slug is not null
             group by 1 order by n desc limit 20) t), '[]'::jsonb),
    'identities_total', (select count(*) from network_identities),
    'identities_new_24h', (select count(*) from network_identities where first_seen_at > now() - interval '24 hours'),
    'cross_app_people', (select count(*) from (
       select network_id from network_identities group by network_id
       having count(distinct source_app) > 1) t),
    'top_scores', coalesce((
       select jsonb_agg(jsonb_build_object('name', trim(coalesce(f.first_name,'') || ' ' || left(coalesce(f.last_name,''),1) || '.'),
                                           'artist', s.artist_slug, 'score', s.score))
       from (select * from network_superfan_scores order by score desc limit 10) s
       left join network_identities ni on ni.network_id = s.network_id
       left join fans f on f.id = ni.hub_fan_id), '[]'::jsonb),
    'fraud_signals_24h', (select count(*) from fraud_signals where created_at > now() - interval '24 hours'),
    'streaks_at_risk', coalesce((
       select jsonb_agg(jsonb_build_object('hub_fan_id', hub_fan_id,
              'name', trim(coalesce(first_name,'') || ' ' || last_initial || '.'),
              'streak', current_streak_days, 'tier', tier))
       from (select * from network_streaks_at_risk limit 20) t), '[]'::jsonb),
    'quiet_superfans', coalesce((
       select jsonb_agg(jsonb_build_object('hub_fan_id', hub_fan_id,
              'name', trim(coalesce(first_name,'') || ' ' || last_initial || '.'),
              'artist', artist_slug, 'score', score, 'last_event_at', last_event_at))
       from (select * from network_quiet_superfans limit 20) t), '[]'::jsonb),
    'upcoming_anniversaries', coalesce((
       select jsonb_agg(jsonb_build_object('hub_fan_id', hub_fan_id,
              'name', trim(coalesce(first_name,'') || ' ' || last_initial || '.'),
              'joined_on', joined_on, 'years', years))
       from (select * from network_upcoming_anniversaries limit 20) t), '[]'::jsonb),
    'pending_actions', coalesce((
       select jsonb_agg(jsonb_build_object('id', id, 'action_type', action_type, 'ring', ring,
              'artist', artist_slug, 'payload', payload, 'reason', reason,
              'proposed_by', proposed_by, 'status', status, 'created_at', created_at))
       from (select * from network_actions where status in ('proposed')
             order by created_at limit 20) t), '[]'::jsonb),
    'latest_brief_date', (select max(brief_date) from network_briefs)
  ) into v_out;

  return v_out;
end $$;

create or replace function public.network_agent_submit(p_api_key uuid, p_kind text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app text;
  v_id bigint;
begin
  select app_name into v_app from network_publishers where api_key = p_api_key and enabled;
  if v_app is null then
    raise exception 'invalid agent key' using errcode = '28000';
  end if;

  if p_kind = 'brief.upsert' then
    insert into network_briefs (brief_date, metrics, summary)
    values (coalesce((p_payload->>'brief_date')::date, current_date),
            coalesce(p_payload->'metrics','{}'::jsonb),
            coalesce(p_payload->>'summary',''))
    on conflict (brief_date) do update
      set metrics = excluded.metrics, summary = excluded.summary, created_at = now();
    return jsonb_build_object('ok', true, 'kind', p_kind);

  elsif p_kind = 'action.propose' then
    insert into network_actions (action_type, ring, network_id, hub_fan_id, artist_slug,
                                 payload, reason, proposed_by, dedupe_key)
    values (p_payload->>'action_type',
            case when p_payload->>'ring' = 'free' then 'free' else 'gated' end,
            nullif(p_payload->>'network_id','')::uuid,
            nullif(p_payload->>'hub_fan_id','')::uuid,
            p_payload->>'artist_slug',
            coalesce(p_payload->'payload','{}'::jsonb),
            p_payload->>'reason',
            v_app,
            p_payload->>'dedupe_key')
    on conflict (dedupe_key) do nothing
    returning id into v_id;
    return jsonb_build_object('ok', true, 'kind', p_kind, 'action_id', v_id);

  elsif p_kind = 'action.draft' then
    update network_actions
       set payload = payload || coalesce(p_payload->'draft','{}'::jsonb),
           status = 'drafted'
     where id = (p_payload->>'action_id')::bigint
       and status = 'proposed'
    returning id into v_id;
    return jsonb_build_object('ok', v_id is not null, 'kind', p_kind, 'action_id', v_id);

  else
    raise exception 'unknown submit kind %', p_kind;
  end if;
end $$;

grant execute on function public.network_agent_pull(uuid) to anon, authenticated;
grant execute on function public.network_agent_submit(uuid, text, jsonb) to anon, authenticated;
