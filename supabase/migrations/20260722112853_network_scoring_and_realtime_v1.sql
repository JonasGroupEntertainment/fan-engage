-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- Superfan scoring view + realtime on the event stream (additive)
-- ============================================================

-- Weighted, recency-decayed superfan score per network identity.
-- security_invoker so RLS on fan_events still governs access.
create or replace view public.network_superfan_scores
with (security_invoker = on) as
with weighted as (
  select
    e.network_id,
    e.artist_slug,
    case e.event_type
      when 'event.checkin'   then 25
      when 'badge.earned'    then 15
      when 'event.rsvp'      then 10
      when 'purchase.completed' then 30
      when 'fan.joined'      then 5
      when 'member.joined'   then 5
      when 'points.awarded'  then greatest(1, least(10, coalesce((e.metadata->>'delta')::int, 1) / 10))
      else 1
    end
    -- recency decay: full weight < 90 days, half < 1 yr, quarter beyond
    * case
        when e.occurred_at > now() - interval '90 days' then 1.0
        when e.occurred_at > now() - interval '365 days' then 0.5
        else 0.25
      end as w
  from public.fan_events e
  where e.network_id is not null
)
select
  network_id,
  artist_slug,
  round(sum(w))::int as score,
  count(*) as event_count
from weighted
group by network_id, artist_slug;

-- Network overview for dashboards
create or replace view public.network_event_summary
with (security_invoker = on) as
select date_trunc('day', occurred_at)::date as day,
       source_app, event_type, count(*) as events
from public.fan_events
group by 1, 2, 3;

-- Live stream: let the hub UI subscribe to new events
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'fan_events'
  ) then
    alter publication supabase_realtime add table public.fan_events;
  end if;
exception when others then null;
end $$;
