-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- DAY ONE ENGINE v1 (additive)
-- Artist stage registry + immutable earliest-fan cohorts per artist,
-- computed from real follow/join history and stamped forever after.
-- ============================================================

create table if not exists public.network_artist_stages (
  artist_slug text primary key,
  stage       text not null default 'garage'
              check (stage in ('garage','van','club','theater','arena','stadium')),
  stage_since timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.network_artist_stages enable row level security;

create table if not exists public.network_artist_stage_history (
  id bigint generated always as identity primary key,
  artist_slug text not null,
  stage text not null,
  effective_from timestamptz not null default now()
);
alter table public.network_artist_stage_history enable row level security;

-- Seed every hub artist at 'garage' (insert-only; Kevin can promote stages later)
insert into public.network_artist_stages (artist_slug)
select slug from public.artists on conflict (artist_slug) do nothing;
insert into public.network_artist_stage_history (artist_slug, stage)
select slug, 'garage' from public.artists
on conflict do nothing;

-- Immutable Day One ledger: rank = order of arrival per artist. Never updated, only inserted.
create table if not exists public.network_day_one (
  hub_fan_id   uuid not null,
  artist_slug  text not null,
  arrived_at   timestamptz not null,
  arrival_rank bigint not null,
  cohort       text not null check (cohort in ('day-one','first-100','early','core')),
  stage_at_arrival text not null default 'garage',
  stamped_at   timestamptz not null default now(),
  primary key (hub_fan_id, artist_slug)
);
create index if not exists network_day_one_artist_idx on public.network_day_one (artist_slug, arrival_rank);
alter table public.network_day_one enable row level security;

create or replace function public.network_cohort_for_rank(r bigint)
returns text language sql immutable as
$$ select case when r <= 25 then 'day-one'
               when r <= 100 then 'first-100'
               when r <= 1000 then 'early'
               else 'core' end $$;

-- Backfill from real history: follows where they exist, else hub join date
with arrivals as (
  select f.id as hub_fan_id,
         a.slug as artist_slug,
         coalesce(fol.followed_at, f.created_at) as arrived_at,
         (fol.fan_id is not null) as followed
  from public.fans f
  cross join public.artists a
  left join public.fan_artist_following fol
    on fol.fan_id = f.id and fol.artist_slug = a.slug
  where fol.fan_id is not null   -- explicit follows: per-artist arrival
), ranked as (
  select hub_fan_id, artist_slug, arrived_at,
         row_number() over (partition by artist_slug order by arrived_at, hub_fan_id) as arrival_rank
  from arrivals
)
insert into public.network_day_one (hub_fan_id, artist_slug, arrived_at, arrival_rank, cohort, stage_at_arrival)
select r.hub_fan_id, r.artist_slug, r.arrived_at, r.arrival_rank,
       public.network_cohort_for_rank(r.arrival_rank),
       coalesce((select stage from network_artist_stages s where s.artist_slug = r.artist_slug), 'garage')
from ranked r
on conflict (hub_fan_id, artist_slug) do nothing;

-- Network-wide founding cohort: artist_slug '_network' = order of joining the hub itself
with ranked as (
  select id as hub_fan_id, created_at,
         row_number() over (order by created_at, id) as arrival_rank
  from public.fans
)
insert into public.network_day_one (hub_fan_id, artist_slug, arrived_at, arrival_rank, cohort, stage_at_arrival)
select hub_fan_id, '_network', created_at, arrival_rank,
       public.network_cohort_for_rank(arrival_rank), 'garage'
from ranked
on conflict (hub_fan_id, artist_slug) do nothing;

-- Stamp future arrivals automatically (exception-safe, never blocks the source write)
create or replace function public.network_stamp_day_one()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rank bigint;
begin
  begin
    if tg_table_name = 'fan_artist_following' then
      select coalesce(max(arrival_rank),0) + 1 into v_rank
      from network_day_one where artist_slug = new.artist_slug;
      insert into network_day_one (hub_fan_id, artist_slug, arrived_at, arrival_rank, cohort, stage_at_arrival)
      values (new.fan_id, new.artist_slug, coalesce(new.followed_at, now()), v_rank,
              network_cohort_for_rank(v_rank),
              coalesce((select stage from network_artist_stages s where s.artist_slug = new.artist_slug), 'garage'))
      on conflict (hub_fan_id, artist_slug) do nothing;
    elsif tg_table_name = 'fans' then
      select coalesce(max(arrival_rank),0) + 1 into v_rank
      from network_day_one where artist_slug = '_network';
      insert into network_day_one (hub_fan_id, artist_slug, arrived_at, arrival_rank, cohort, stage_at_arrival)
      values (new.id, '_network', coalesce(new.created_at, now()), v_rank,
              network_cohort_for_rank(v_rank), 'garage')
      on conflict (hub_fan_id, artist_slug) do nothing;
    end if;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists network_day_one_follow on public.fan_artist_following;
create trigger network_day_one_follow after insert on public.fan_artist_following
  for each row execute function public.network_stamp_day_one();
drop trigger if exists network_day_one_fan on public.fans;
create trigger network_day_one_fan after insert on public.fans
  for each row execute function public.network_stamp_day_one();

revoke execute on function public.network_stamp_day_one() from public, anon, authenticated;

-- Stage promotions: history + follower stage-stamp event when Kevin advances an artist
create or replace function public.network_promote_artist_stage(p_artist text, p_stage text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update network_artist_stages set stage = p_stage, stage_since = now(), updated_at = now()
  where artist_slug = p_artist;
  insert into network_artist_stage_history (artist_slug, stage) values (p_artist, p_stage);
  insert into fan_events (event_type, source_app, artist_slug, entity_type, entity_id, metadata, dedupe_key)
  values ('artist.stage.advanced', 'fan_engage_internal', p_artist, 'stage', p_stage,
          jsonb_build_object('stage', p_stage), 'stage:' || p_artist || ':' || p_stage)
  on conflict (dedupe_key) do nothing;
end $$;
revoke execute on function public.network_promote_artist_stage(text, text) from public, anon, authenticated;
