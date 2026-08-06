-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Fix: fan_badges keys badges by badge_slug, not badge_id; checkins carry artist_slug
create or replace function public.network_publish_internal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event_type text;
  v_fan_id uuid;
  v_artist text;
  v_entity_type text;
  v_entity_id text;
  v_meta jsonb := '{}'::jsonb;
  v_network uuid;
begin
  begin
    if tg_table_name = 'points_ledger' then
      v_event_type := 'points.awarded';
      v_fan_id := new.fan_id;
      v_entity_type := 'points_ledger';
      v_entity_id := new.id::text;
      v_meta := jsonb_build_object('delta', new.delta, 'source', new.source::text, 'note', new.note);
    elsif tg_table_name = 'event_rsvps' then
      v_event_type := 'event.rsvp';
      v_fan_id := new.fan_id;
      v_entity_type := 'artist_event';
      v_entity_id := new.event_id::text;
    elsif tg_table_name = 'fan_badges' then
      v_event_type := 'badge.earned';
      v_fan_id := new.fan_id;
      v_entity_type := 'badge';
      v_entity_id := new.badge_slug;
      v_meta := jsonb_build_object('earned_at', new.earned_at);
    elsif tg_table_name = 'checkins' then
      v_event_type := 'event.checkin';
      v_fan_id := new.fan_id;
      v_artist := new.artist_slug;
      v_entity_type := 'checkin';
      v_entity_id := new.id::text;
      v_meta := jsonb_build_object('points_awarded', new.points_awarded);
    else
      return new;
    end if;

    select ni.network_id into v_network
    from network_identities ni
    where ni.source_app = 'fan_engage' and ni.local_id = v_fan_id::text;

    insert into fan_events
      (event_type, source_app, local_actor_id, network_id, hub_fan_id,
       artist_slug, entity_type, entity_id, metadata, dedupe_key)
    values
      (v_event_type, 'fan_engage_internal', v_fan_id::text, v_network, v_fan_id,
       v_artist, v_entity_type, v_entity_id, v_meta,
       'fe:' || tg_table_name || ':' || coalesce(v_entity_id,'') || ':' || coalesce(v_fan_id::text,''))
    on conflict (dedupe_key) do nothing;
  exception when others then
    null;
  end;
  return new;
end $$;
