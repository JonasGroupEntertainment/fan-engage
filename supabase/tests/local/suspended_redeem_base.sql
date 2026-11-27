-- Stand-in schema for the local test of migration 0116. Not production.
do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute 'create role ' || r; end if;
  end loop;
end $$;
create schema if not exists auth;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table fans (id uuid primary key, suspended boolean not null default false, total_points integer not null default 0);
create table fan_community_memberships (fan_id uuid, community_id text, subscription_tier text);
create table rewards_catalog (id uuid primary key, title text not null, community_id text, point_cost integer not null, stock integer, requires_tier text, updated_at timestamptz default now());
create table reward_redemptions (id uuid primary key default gen_random_uuid(), fan_id uuid, reward_id uuid, community_id text, point_cost integer, delivery_details text, status text);
create table points_ledger (id bigint generated always as identity primary key, fan_id uuid not null, delta integer not null, source text not null, source_ref text, community_id text, note text);
create function reward_is_digitally_redeemable(r rewards_catalog) returns boolean language sql as $$ select true $$;
create function fan_ledger_balance(p_fan_id uuid) returns integer language sql as $$ select coalesce(sum(delta), 0)::integer from points_ledger where fan_id = p_fan_id $$;
create function sync_points_from_ledger(p_fan_id uuid) returns void language sql as $$ update fans set total_points = fan_ledger_balance(p_fan_id) where id = p_fan_id $$;
create function upsert_notification(uuid, text, text, text, text, text, text, text) returns void language sql as $$ select $$;
insert into fans (id, suspended) values ('00000000-0000-0000-0000-00000000000a', false), ('00000000-0000-0000-0000-00000000000b', true);
insert into fan_community_memberships values ('00000000-0000-0000-0000-00000000000a', 'raelynn', 'free'), ('00000000-0000-0000-0000-00000000000b', 'raelynn', 'free');
insert into rewards_catalog (id, title, community_id, point_cost, stock) values ('00000000-0000-0000-0000-0000000000e1', 'Sticker', 'raelynn', 100, 5);
insert into points_ledger (fan_id, delta, source) values ('00000000-0000-0000-0000-00000000000a', 500, 'signup_bonus'), ('00000000-0000-0000-0000-00000000000b', 500, 'signup_bonus');
