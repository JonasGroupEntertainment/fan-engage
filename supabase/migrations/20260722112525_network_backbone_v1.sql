-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- NETWORK BACKBONE v1 (additive only)
-- New objects: network_identities, fan_events, network_publishers,
-- ingest RPC, identity backfill. No existing table is modified.
-- ============================================================

-- 1) Identity map: one network_id per human, many (source_app, local_id) rows
create table if not exists public.network_identities (
  source_app   text not null,
  local_id     text not null,
  network_id   uuid not null default gen_random_uuid(),
  email_norm   text,
  hub_fan_id   uuid references public.fans(id),
  first_seen_at timestamptz not null default now(),
  primary key (source_app, local_id)
);
create index if not exists network_identities_network_idx on public.network_identities (network_id);
create index if not exists network_identities_email_idx   on public.network_identities (email_norm);

-- 2) The event stream
create table if not exists public.fan_events (
  id             bigint generated always as identity primary key,
  event_type     text not null,
  source_app     text not null,
  local_actor_id text,
  network_id     uuid,
  hub_fan_id     uuid,
  artist_slug    text,
  entity_type    text,
  entity_id      text,
  occurred_at    timestamptz not null default now(),
  received_at    timestamptz not null default now(),
  metadata       jsonb not null default '{}'::jsonb,
  dedupe_key     text unique
);
create index if not exists fan_events_type_idx     on public.fan_events (event_type);
create index if not exists fan_events_network_idx  on public.fan_events (network_id);
create index if not exists fan_events_occurred_idx on public.fan_events (occurred_at desc);
create index if not exists fan_events_source_idx   on public.fan_events (source_app);

-- 3) Publisher registry (API keys for feeder apps)
create table if not exists public.network_publishers (
  app_name   text primary key,
  api_key    uuid not null default gen_random_uuid(),
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4) Lock everything down: RLS on, no policies (service role + definer fn only)
alter table public.network_identities enable row level security;
alter table public.fan_events         enable row level security;
alter table public.network_publishers enable row level security;

-- 5) Identity resolution helper (internal)
create or replace function public.network_resolve_identity(
  p_source_app text, p_local_id text, p_email text
) returns table (r_network_id uuid, r_hub_fan_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_email_norm text := nullif(lower(trim(coalesce(p_email,''))), '');
  v_network_id uuid;
  v_hub_fan_id uuid;
begin
  -- existing mapping for this app-local user?
  select ni.network_id, ni.hub_fan_id into v_network_id, v_hub_fan_id
  from network_identities ni
  where ni.source_app = p_source_app and ni.local_id = p_local_id;

  if v_network_id is null then
    -- same human known from another app by email?
    if v_email_norm is not null then
      select ni.network_id, ni.hub_fan_id into v_network_id, v_hub_fan_id
      from network_identities ni
      where ni.email_norm = v_email_norm
      limit 1;
    end if;
    v_network_id := coalesce(v_network_id, gen_random_uuid());
    -- link to a hub fan by email if we can
    if v_hub_fan_id is null and v_email_norm is not null then
      select f.id into v_hub_fan_id from fans f
      where lower(f.email::text) = v_email_norm limit 1;
    end if;
    insert into network_identities (source_app, local_id, network_id, email_norm, hub_fan_id)
    values (p_source_app, p_local_id, v_network_id, v_email_norm, v_hub_fan_id)
    on conflict (source_app, local_id) do nothing;
  end if;

  return query select v_network_id, v_hub_fan_id;
end $$;

-- 6) Ingest RPC: the single door feeder apps knock on (via PostgREST)
create or replace function public.network_ingest_event(
  p_api_key uuid, p_event jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_app       text;
  v_event_id  bigint;
  v_network   uuid;
  v_hub_fan   uuid;
  v_local_id  text := p_event->>'local_actor_id';
  v_email     text := p_event->>'actor_email';
begin
  select app_name into v_app from network_publishers
  where api_key = p_api_key and enabled;
  if v_app is null then
    raise exception 'invalid publisher key' using errcode = '28000';
  end if;

  if v_local_id is not null then
    select r_network_id, r_hub_fan_id into v_network, v_hub_fan
    from network_resolve_identity(v_app, v_local_id, v_email);
  end if;

  insert into fan_events
    (event_type, source_app, local_actor_id, network_id, hub_fan_id,
     artist_slug, entity_type, entity_id, occurred_at, metadata, dedupe_key)
  values
    (coalesce(p_event->>'event_type','unknown'), v_app, v_local_id, v_network, v_hub_fan,
     p_event->>'artist_slug', p_event->>'entity_type', p_event->>'entity_id',
     coalesce((p_event->>'occurred_at')::timestamptz, now()),
     coalesce(p_event->'metadata','{}'::jsonb),
     p_event->>'dedupe_key')
  on conflict (dedupe_key) do nothing
  returning id into v_event_id;

  return v_event_id;
end $$;

-- PostgREST callers (feeders use the anon key + their api_key parameter)
grant execute on function public.network_ingest_event(uuid, jsonb) to anon, authenticated;
revoke execute on function public.network_resolve_identity(text, text, text) from public, anon, authenticated;

-- 7) Register the first publishers
insert into public.network_publishers (app_name) values
  ('raelynn_site'), ('brand_engage'), ('that_ads_up'), ('fan_engage_internal')
on conflict (app_name) do nothing;

-- 8) Backfill: every existing hub fan gets a network identity (insert-only)
insert into public.network_identities (source_app, local_id, network_id, email_norm, hub_fan_id)
select 'fan_engage', f.id::text, gen_random_uuid(), lower(f.email::text), f.id
from public.fans f
on conflict (source_app, local_id) do nothing;
