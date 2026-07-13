-- ============================================================================
-- 0046_economy_rebalance.sql — make the points economy reachable
-- ============================================================================
-- At the working earn rate (~60 pts on an active day) the old thresholds
-- meant Silver took six weeks and Platinum over a year. New ladder:
--   Silver 750 (~2 weeks of showing up), Gold 3,500 (~2 months),
--   Platinum 8,000 (a full season of loyalty).
-- Also seeds one low-cost (250 pt) digital reward per active community so
-- new fans can taste redemption in their first week instead of month six.
-- ============================================================================

update tiers set min_points = 750   where slug = 'silver';
update tiers set min_points = 3500  where slug = 'gold';
update tiers set min_points = 8000  where slug = 'platinum';

-- Recompute both denormalised tier columns against the new ladder.
update fans f
   set current_tier = sub.slug
  from (
    select f2.id,
           (select slug from tiers
             where min_points <= coalesce(f2.total_points, 0)
             order by min_points desc limit 1) as slug
      from fans f2
  ) sub
 where f.id = sub.id
   and sub.slug is not null
   and f.current_tier is distinct from sub.slug;

update fan_community_memberships m
   set current_tier = sub.slug
  from (
    select m2.fan_id, m2.community_id,
           (select slug from tiers
             where min_points <= coalesce(m2.total_points, 0)
             order by min_points desc limit 1) as slug
      from fan_community_memberships m2
  ) sub
 where m.fan_id = sub.fan_id and m.community_id = sub.community_id
   and sub.slug is not null
   and m.current_tier is distinct from sub.slug;

-- Starter reward: cheap, digital, zero-fulfillment-risk. Idempotent.
insert into rewards_catalog (community_id, title, description, point_cost, kind, active, sort_order)
select c.slug,
       'Exclusive Phone Wallpaper Pack',
       'A set of exclusive phone wallpapers, only for community members. Your first redemption is closer than you think.',
       250,
       'custom',
       true,
       0
  from communities c
 where c.active = true
   and not exists (
     select 1 from rewards_catalog r
      where r.community_id = c.slug
        and r.title = 'Exclusive Phone Wallpaper Pack'
   );
