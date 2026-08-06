-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- AUTONOMY SPINE v1 (additive only)
-- network_actions: the governed queue every autonomous agent works through.
-- Rings: 'free' (observe/draft/personalize) and 'gated' (needs human approval).
-- 'forbidden' actions never enter the queue at all.
-- Agents can propose and draft; ONLY humans (service role UI) approve/execute.
-- ============================================================

create table if not exists public.network_actions (
  id          bigint generated always as identity primary key,
  action_type text not null,
  ring        text not null default 'gated' check (ring in ('free','gated')),
  network_id  uuid,
  hub_fan_id  uuid,
  artist_slug text,
  payload     jsonb not null default '{}'::jsonb,
  reason      text,
  proposed_by text not null,
  status      text not null default 'proposed'
              check (status in ('proposed','drafted','approved','rejected','executed','expired')),
  decided_by  text,
  decided_at  timestamptz,
  executed_at timestamptz,
  created_at  timestamptz not null default now(),
  dedupe_key  text unique
);
create index if not exists network_actions_status_idx on public.network_actions (status);
create index if not exists network_actions_type_idx   on public.network_actions (action_type);
alter table public.network_actions enable row level security;

-- Concierge candidate views (all read existing tables; security_invoker)
create or replace view public.network_streaks_at_risk
with (security_invoker = on) as
select f.id as hub_fan_id, f.first_name,
       left(coalesce(f.last_name,''),1) as last_initial,
       f.current_streak_days, f.last_active_date, f.current_tier::text as tier
from public.fans f
where f.current_streak_days >= 3
  and f.last_active_date = current_date - 1
  and coalesce(f.suspended,false) = false;

create or replace view public.network_quiet_superfans
with (security_invoker = on) as
select s.network_id, s.artist_slug, s.score,
       f.id as hub_fan_id, f.first_name,
       left(coalesce(f.last_name,''),1) as last_initial,
       max(e.occurred_at) as last_event_at
from public.network_superfan_scores s
join public.network_identities ni on ni.network_id = s.network_id
left join public.fans f on f.id = ni.hub_fan_id
left join public.fan_events e on e.network_id = s.network_id
group by s.network_id, s.artist_slug, s.score, f.id, f.first_name, f.last_name
having s.score >= 20
   and (max(e.occurred_at) is null or max(e.occurred_at) < now() - interval '14 days');

create or replace view public.network_upcoming_anniversaries
with (security_invoker = on) as
select f.id as hub_fan_id, f.first_name,
       left(coalesce(f.last_name,''),1) as last_initial,
       f.created_at::date as joined_on,
       (date_part('year', now()) - date_part('year', f.created_at))::int as years,
       to_char(f.created_at, 'MM-DD') as anniversary_md
from public.fans f
where coalesce(f.suspended,false) = false
  and date_part('year', f.created_at) < date_part('year', now())
  and to_char(f.created_at,'MM-DD')::text
      between to_char(now(),'MM-DD') and to_char(now() + interval '7 days','MM-DD');

-- Moment engine: a dropped release auto-proposes a gated moment draft
create or replace function public.network_propose_moment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.event_type = 'release.dropped' then
      insert into network_actions
        (action_type, ring, artist_slug, payload, reason, proposed_by, dedupe_key)
      values
        ('moment.draft', 'gated', new.artist_slug,
         jsonb_build_object('source_event_id', new.id, 'release', new.metadata),
         'Auto-proposed: new release detected on ' || new.source_app,
         'moment_engine',
         'moment:' || coalesce(new.entity_id, new.id::text))
      on conflict (dedupe_key) do nothing;
    end if;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists network_moment_engine on public.fan_events;
create trigger network_moment_engine
  after insert on public.fan_events
  for each row execute function public.network_propose_moment();

revoke execute on function public.network_propose_moment() from public, anon, authenticated;

-- Register the autonomous agents in the key registry
insert into public.network_publishers (app_name) values ('narrator'), ('network_worker')
on conflict (app_name) do nothing;
