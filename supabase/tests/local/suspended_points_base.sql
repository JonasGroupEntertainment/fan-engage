-- Stand-in schema for the local test of migration 0115. Not production.
do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute 'create role ' || r; end if;
  end loop;
end $$;
create type point_source as enum ('signup_bonus','daily_checkin','daily_drop','challenge','badge','reward_redemption','manual_adjustment');
create table fans (id uuid primary key, suspended boolean not null default false, total_points integer not null default 0);
create table fan_community_memberships (fan_id uuid, community_id text, founding_fan_number integer);
create table points_ledger (id bigint generated always as identity primary key, fan_id uuid not null, delta integer not null, source point_source not null, source_ref text, community_id text, note text, multiplier numeric, created_at timestamptz not null default now());
create function points_multiplier(p_fan_id uuid, p_community_id text) returns numeric language sql as $$ select 1::numeric $$;
create function sync_points_from_ledger(p_fan_id uuid) returns void language sql as $$
  update fans set total_points = coalesce((select sum(delta) from points_ledger where fan_id = p_fan_id), 0) where id = p_fan_id $$;
insert into fans (id, suspended) values
  ('00000000-0000-0000-0000-00000000000a', false),
  ('00000000-0000-0000-0000-00000000000b', true);
