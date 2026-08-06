-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- Hub self-publishing: existing activity streams into fan_events.
-- AFTER-INSERT triggers, exception-safe so app writes NEVER fail.
-- Additive only.
-- ============================================================

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
      v_entity_id := new.badge_id::text;
    elsif tg_table_name = 'checkins' then
      v_event_type := 'event.checkin';
      v_fan_id := new.fan_id;
      v_entity_type := 'checkin';
      v_entity_id := new.id::text;
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
       'fe:' || tg_table_name || ':' || v_entity_id);
  exception when others then
    -- never block the source write
    null;
  end;
  return new;
end $$;

drop trigger if exists network_publish_points on public.points_ledger;
create trigger network_publish_points
  after insert on public.points_ledger
  for each row execute function public.network_publish_internal();

drop trigger if exists network_publish_rsvps on public.event_rsvps;
create trigger network_publish_rsvps
  after insert on public.event_rsvps
  for each row execute function public.network_publish_internal();

drop trigger if exists network_publish_badges on public.fan_badges;
create trigger network_publish_badges
  after insert on public.fan_badges
  for each row execute function public.network_publish_internal();

drop trigger if exists network_publish_checkins on public.checkins;
create trigger network_publish_checkins
  after insert on public.checkins
  for each row execute function public.network_publish_internal();

-- Auto-create identities for future hub signups (insert-only side effect)
create or replace function public.network_register_new_fan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into network_identities (source_app, local_id, network_id, email_norm, hub_fan_id)
    values ('fan_engage', new.id::text, gen_random_uuid(), lower(new.email::text), new.id)
    on conflict (source_app, local_id) do nothing;

    insert into fan_events (event_type, source_app, local_actor_id, hub_fan_id, network_id, dedupe_key)
    select 'fan.joined', 'fan_engage_internal', new.id::text, new.id, ni.network_id, 'fe:fan_joined:' || new.id::text
    from network_identities ni
    where ni.source_app = 'fan_engage' and ni.local_id = new.id::text;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists network_register_fan on public.fans;
create trigger network_register_fan
  after insert on public.fans
  for each row execute function public.network_register_new_fan();
