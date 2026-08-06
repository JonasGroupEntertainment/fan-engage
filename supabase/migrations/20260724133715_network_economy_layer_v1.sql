-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- ECONOMY LAYER v1 (additive)
-- ============================================================

-- Cross-hub perk marketplace: latest version of each brand special
create or replace view public.network_brand_perks
with (security_invoker = on) as
select distinct on (entity_id)
  entity_id as special_id,
  metadata->>'brand_slug' as brand_slug,
  metadata->>'title' as title,
  metadata->>'description' as description,
  (metadata->>'points_required')::int as points_required,
  metadata->>'tier' as required_tier,
  (metadata->>'active')::boolean as active,
  (metadata->>'starts_at')::timestamptz as starts_at,
  (metadata->>'ends_at')::timestamptz as ends_at,
  metadata->>'image_url' as image_url,
  received_at as last_synced_at
from public.fan_events
where event_type = 'perk.published'
order by entity_id, received_at desc;

-- Presale allocation: given an artist and N slots, the N most-verified fans.
-- Ranking: superfan score desc, then real-world verification (checkins), then
-- Day One arrival rank asc, then tenure. Service-role only.
create or replace function public.network_presale_allocate(p_artist text, p_slots int)
returns table (
  allocation_rank bigint, hub_fan_id uuid, display_name text,
  score int, cohort text, arrival_rank bigint, checkins bigint, tier text
)
language sql security definer set search_path = public as $$
  with candidates as (
    select f.id as hub_fan_id,
           trim(coalesce(f.first_name,'') || ' ' || left(coalesce(f.last_name,''),1) || '.') as display_name,
           coalesce(s.score, 0) as score,
           coalesce(d.cohort, 'core') as cohort,
           coalesce(d.arrival_rank, 999999) as arrival_rank,
           coalesce(c.n, 0) as checkins,
           f.current_tier::text as tier,
           f.created_at
    from fans f
    left join network_identities ni on ni.hub_fan_id = f.id and ni.source_app = 'fan_engage'
    left join network_superfan_scores s on s.network_id = ni.network_id and s.artist_slug = p_artist
    left join network_day_one d on d.hub_fan_id = f.id and d.artist_slug = p_artist
    left join (select hub_fan_id, count(*) n from fan_events
               where event_type = 'event.checkin' group by 1) c on c.hub_fan_id = f.id
    where coalesce(f.suspended, false) = false
      and (d.hub_fan_id is not null or s.score is not null
           or exists (select 1 from fan_artist_following fol
                      where fol.fan_id = f.id and fol.artist_slug = p_artist))
  )
  select row_number() over (order by score desc, checkins desc, arrival_rank asc, created_at asc) as allocation_rank,
         hub_fan_id, display_name, score, cohort, arrival_rank, checkins, tier
  from candidates
  order by allocation_rank
  limit p_slots;
$$;
revoke execute on function public.network_presale_allocate(text, int) from public, anon, authenticated;

-- Economy health metrics, added to the daily pulse
create or replace function public.network_economy_metrics()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'points_outstanding', (select coalesce(sum(total_points),0) from fans),
    'points_issued_24h', (select coalesce(sum(delta),0) from points_ledger
                          where delta > 0 and created_at > now() - interval '24 hours'),
    'points_spent_24h', (select coalesce(abs(sum(delta)),0) from points_ledger
                         where delta < 0 and created_at > now() - interval '24 hours'),
    'redemptions_7d', (select count(*) from reward_redemptions
                       where created_at > now() - interval '7 days'),
    'active_rewards', (select count(*) from rewards_catalog where active),
    'active_brand_perks', (select count(*) from network_brand_perks
                           where active and (ends_at is null or ends_at > now())),
    'redemption_liability_points', (select coalesce(sum(point_cost),0) from reward_redemptions
                                    where status not in ('fulfilled','cancelled'))
  );
$$;
revoke execute on function public.network_economy_metrics() from public, anon, authenticated;
