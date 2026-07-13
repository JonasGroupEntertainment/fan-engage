-- ============================================================================
-- 0045_membership_points_sync.sql — engagement points reach the visible balance
-- ============================================================================
-- The Phase-1 review found the platform's most damaging defect: the trigger
-- award path (posts +5, comments +2, poll votes +1, challenge entries +3,
-- RSVPs +10, badge bonuses) updated only the legacy fans.total_points column.
-- The UI (getCurrentFanKpis) reads fan_community_memberships.total_points, so
-- fans who engaged saw their balance and tier progress stay flat.
--
-- This migration:
--   1. Adds bump_membership_points() — updates the membership balance and
--      recomputes current_tier from the tiers table.
--   2. Rewrites the six award functions to call it and to stamp community_id
--      on their points_ledger rows (the TS awardPoints path already does).
--   3. Backfills history: every ledger row with a NULL community_id is mapped
--      to its community via its source_ref, summed into membership balances,
--      and stamped. Because only NULL-community rows are processed and they
--      get stamped in the same statement, re-running is a no-op.
-- ============================================================================

-- 1 ─── helper ───────────────────────────────────────────────────────────────
create or replace function public.bump_membership_points(
  p_fan_id uuid, p_community_id text, p_delta int
) returns void
language plpgsql security definer set search_path = public as $$
declare v_tier tier_slug;
begin
  if p_community_id is null or p_delta = 0 then return; end if;

  -- Mirrors lib/points/award.ts: only update an existing membership; earning
  -- points in a community you never joined does not create a membership.
  update fan_community_memberships
     set total_points = greatest(coalesce(total_points, 0) + p_delta, 0)
   where fan_id = p_fan_id and community_id = p_community_id;

  if not found then return; end if;

  select t.slug into v_tier
    from tiers t
    join fan_community_memberships m
      on m.fan_id = p_fan_id and m.community_id = p_community_id
   where t.min_points <= m.total_points
   order by t.min_points desc
   limit 1;

  if v_tier is not null then
    update fan_community_memberships
       set current_tier = v_tier
     where fan_id = p_fan_id and community_id = p_community_id
       and current_tier is distinct from v_tier;
  end if;
end $$;

-- 2 ─── award functions (prod bodies from 0016 + membership sync) ────────────
create or replace function public.award_community_post_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 5;
  v_multiplier numeric := public.points_multiplier(new.author_id, new.artist_slug);
  award        int     := round(base_award * v_multiplier)::int;
  ref_id       text    := 'community_post:' || new.id::text;
begin
  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
    values (
      new.author_id, award, 'challenge', ref_id, new.artist_slug,
      case when v_multiplier > 1 then 'Community post (premium 1.5×)' else 'Community post' end
    );
    update fans set total_points = coalesce(total_points, 0) + award
     where id = new.author_id;
    perform public.bump_membership_points(new.author_id, new.artist_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_community_comment_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 2;
  v_slug       text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'community_comment:' || new.id::text;
begin
  select artist_slug into v_slug from public.community_posts where id = new.post_id;
  v_multiplier := public.points_multiplier(new.author_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
    values (
      new.author_id, award, 'challenge', ref_id, v_slug,
      case when v_multiplier > 1 then 'Community comment (premium 1.5×)' else 'Community comment' end
    );
    update fans set total_points = coalesce(total_points, 0) + award
     where id = new.author_id;
    perform public.bump_membership_points(new.author_id, v_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_poll_vote_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 1;
  v_slug       text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'poll_vote:' || new.post_id::text || ':' || new.fan_id::text;
begin
  select artist_slug into v_slug from public.community_posts where id = new.post_id;
  v_multiplier := public.points_multiplier(new.fan_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
    values (
      new.fan_id, award, 'challenge', ref_id, v_slug,
      case when v_multiplier > 1 then 'Poll vote (premium 1.5×)' else 'Poll vote' end
    );
    update fans set total_points = coalesce(total_points, 0) + award
     where id = new.fan_id;
    perform public.bump_membership_points(new.fan_id, v_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_challenge_entry_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 3;
  v_slug       text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'challenge_entry:' || new.id::text;
begin
  select artist_slug into v_slug from public.community_posts where id = new.post_id;
  v_multiplier := public.points_multiplier(new.fan_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
    values (
      new.fan_id, award, 'challenge', ref_id, v_slug,
      case when v_multiplier > 1 then 'Challenge submission (premium 1.5×)' else 'Challenge submission' end
    );
    update fans set total_points = coalesce(total_points, 0) + award
     where id = new.fan_id;
    perform public.bump_membership_points(new.fan_id, v_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_event_rsvp_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 10;
  v_slug       text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'event_rsvp:' || new.event_id::text || ':' || new.fan_id::text;
begin
  select artist_slug into v_slug from public.artist_events where id = new.event_id;
  v_multiplier := public.points_multiplier(new.fan_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
    values (
      new.fan_id, award, 'event_rsvp', ref_id, v_slug,
      case when v_multiplier > 1 then 'RSVPed to event (premium 1.5×)' else 'RSVPed to event' end
    );
    update fans set total_points = coalesce(total_points, 0) + award
     where id = new.fan_id;
    perform public.bump_membership_points(new.fan_id, v_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_community_badge(
  p_fan_id uuid, p_slug text, p_community_id text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_points   integer;
  v_name     text;
  v_icon     text;
  v_ref      text;
  v_inserted boolean;
begin
  insert into fan_badges (fan_id, badge_slug, community_id)
  values (p_fan_id, p_slug, p_community_id)
  on conflict (fan_id, badge_slug, community_id) do nothing
  returning true into v_inserted;

  if v_inserted is null then return false; end if;

  select point_value, name, icon into v_points, v_name, v_icon
    from badges where slug = p_slug;

  if coalesce(v_points, 0) > 0 then
    v_ref := 'badge:' || p_slug || ':' || p_community_id || ':' || p_fan_id::text;
    if not exists (select 1 from points_ledger where source_ref = v_ref) then
      insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
      values (
        p_fan_id, v_points, 'manual_adjustment', v_ref, p_community_id,
        'Badge earned: ' || p_slug || ' (' || p_community_id || ')'
      );
      update fans set total_points = coalesce(total_points, 0) + v_points
       where id = p_fan_id;
      perform public.bump_membership_points(p_fan_id, p_community_id, v_points);
    end if;
  end if;

  perform upsert_notification(
    p_fan_id,
    'badge_earned',
    coalesce(v_name, 'Badge earned'),
    case when coalesce(v_points, 0) > 0
         then 'You earned ' || v_points || ' bonus points.'
         else 'You unlocked a new badge.' end,
    '/rewards',
    v_icon,
    'badge:' || p_slug || ':' || p_community_id
  );

  return true;
end $$;

-- 3 ─── backfill ─────────────────────────────────────────────────────────────
-- Map every unstamped ledger row to its community, add the deltas to the
-- membership balances, and stamp the rows so this never double-counts.
with mapped as (
  select l.id, l.fan_id, l.delta,
    case
      when l.source_ref like 'community_post:%' then
        (select artist_slug from community_posts where id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'community_comment:%' then
        (select p.artist_slug from community_comments c
           join community_posts p on p.id = c.post_id
          where c.id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'poll_vote:%' then
        (select artist_slug from community_posts where id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'challenge_entry:%' then
        (select p.artist_slug from community_challenge_entries e
           join community_posts p on p.id = e.post_id
          where e.id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'event_rsvp:%' then
        (select artist_slug from artist_events where id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'badge:%' and exists
        (select 1 from communities where slug = split_part(l.source_ref, ':', 3)) then
        split_part(l.source_ref, ':', 3)
    end as community_id
  from points_ledger l
  where l.community_id is null
    and (l.source_ref like 'community_post:%'
      or l.source_ref like 'community_comment:%'
      or l.source_ref like 'poll_vote:%'
      or l.source_ref like 'challenge_entry:%'
      or l.source_ref like 'event_rsvp:%'
      or l.source_ref like 'badge:%')
),
sums as (
  select fan_id, community_id, sum(delta)::int as total_delta
  from mapped where community_id is not null
  group by fan_id, community_id
),
bumped as (
  update fan_community_memberships m
     set total_points = greatest(coalesce(m.total_points, 0) + s.total_delta, 0)
    from sums s
   where m.fan_id = s.fan_id and m.community_id = s.community_id
  returning m.fan_id
)
update points_ledger l
   set community_id = m.community_id
  from mapped m
 where l.id = m.id and m.community_id is not null;

-- Recompute tiers for every membership touched by history.
update fan_community_memberships m
   set current_tier = sub.slug
  from (
    select m2.fan_id, m2.community_id,
           (select slug from tiers
             where min_points <= m2.total_points
             order by min_points desc limit 1) as slug
      from fan_community_memberships m2
  ) sub
 where m.fan_id = sub.fan_id and m.community_id = sub.community_id
   and sub.slug is not null
   and m.current_tier is distinct from sub.slug;
