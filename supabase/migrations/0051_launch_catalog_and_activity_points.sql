-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — launch catalog (soft-hide reserve SKUs) + activity points
--
-- Live today: comment/poll triggers still award 2/1 with no cap. This
-- REPLACES those function bodies (same trigger names) with +10/cap 5 and
-- +10/cap 3. Do not layer a second award path on top of 2/1.
-- Referrer +150 on verified join already fires in app code — this file
-- only ADDS friend +50 on that same verified row. Do not re-pay 150.
-- Share live row is 50 once; this replaces that award with +15 and a
-- 3/day cap. Does not uncap challenges. Does not delete catalog rows.
--
-- Safe to re-run (idempotent).
-- Apply via: Supabase dashboard → SQL Editor → paste this file → Run.
-- ────────────────────────────────────────────────────────────────────────────


-- ─── 1. Catalog flags (soft-hide + BTS clip + in-app Spotlight) ───────────

alter table public.rewards_catalog
  add column if not exists clip_url text;

alter table public.rewards_catalog
  add column if not exists in_app_only boolean not null default false;

alter table public.fan_community_memberships
  add column if not exists founding_fan_number integer;

create unique index if not exists memberships_founding_fan_number_uidx
  on public.fan_community_memberships (community_id, founding_fan_number)
  where founding_fan_number is not null;


-- ─── 2. Soft-hide reserve catalog (prefer unpublish over delete) ──────────

-- 18 unscoped (community_id is null) reserve rows from 0048, plus every
-- other non-launch SKU (voice notes, shoutouts, merch, presale, M&G, etc.).
-- Keep RaeLynn launch titles eligible; BTS stays unpublished until a clip
-- is attached below.

-- Named live SKUs still ON (RaeLynn + unscoped reserve + tour tee).
update public.rewards_catalog
   set active = false,
       updated_at = now()
 where title in (
         'Early Album Access',
         'Personal Voice Note',
         'Merch Discount Code',
         'Video Shoutout',
         'Limited Edition Tour Tee',
         'Presale Password Unlock',
         'Early Access Presale Window',
         'Front-of-Line Queue Position',
         'VIP Ticket Upgrade',
         'Soundcheck Access',
         'Meet & Greet Pass',
         'Backstage Tour',
         'Merch Bundle with Ticket',
         'Priority Seating Upgrade',
         'Parking / Rideshare Credit',
         'Behind-the-Scenes Video',
         'Unreleased Demo Unlock',
         'Digital Autograph',
         'Exclusive Acoustic Session Stream',
         'Signed Physical Merch',
         'Personalized Shoutout Video',
         'Birthday Shoutout'
       )
    or title ilike '%tour tee%';

-- Catch-all: anything that is not a RaeLynn launch SKU stays unpublished.
update public.rewards_catalog
   set active = false,
       updated_at = now()
 where community_id is null
    or community_id is distinct from 'raelynn'
    or title not in (
         'Phone Wallpaper',
         'Exclusive Phone Wallpaper Pack',
         'Lyric Wallpaper',
         'Behind-the-Song Video',
         'Fan Spotlight',
         'VIP Moment Raffle'
       );

-- Misplaced BEP offer on the RaeLynn hub (live: ~65 pts).
update public.rewards_catalog
   set active = false,
       updated_at = now()
 where title ilike '%bourbon and cigar%'
    or (title ilike '%nellie%' and title ilike '%cigar%')
    or (community_id = 'raelynn' and point_cost = 65 and title ilike '%nellie%');

update public.offers
   set active = false
 where title ilike '%bourbon and cigar%'
    or (title ilike '%nellie%' and title ilike '%cigar%')
    or category = 'merch';

-- Guest-visible challenge copy: do not promise vinyl / merch prizes.
update public.community_posts
   set body = regexp_replace(
         regexp_replace(body, 'signed vinyl', 'bonus points', 'gi'),
         'merch prizes', 'bonus points', 'gi'
       )
 where kind = 'challenge'
   and (
     body ilike '%signed vinyl%'
     or body ilike '%merch prize%'
   );

update public.community_poll_options
   set label = 'Exclusive digital drops'
 where label ilike '%merch drop%';


-- ─── 3. Upsert RaeLynn launch SKUs (do not expand the set) ────────────────

-- Phone Wallpaper 250 (rename the 0046 starter row when present).
update public.rewards_catalog
   set title = 'Phone Wallpaper',
       description = 'Exclusive phone wallpaper for community members.',
       point_cost = 250,
       kind = 'custom',
       active = true,
       in_app_only = false,
       sort_order = 0,
       requires_tier = null,
       updated_at = now()
 where community_id = 'raelynn'
   and title in ('Phone Wallpaper', 'Exclusive Phone Wallpaper Pack');

insert into public.rewards_catalog
  (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier, in_app_only)
select 'raelynn',
       'Phone Wallpaper',
       'Exclusive phone wallpaper for community members.',
       250, 'custom', null, true, 0, null, false
 where not exists (
   select 1 from public.rewards_catalog
    where community_id = 'raelynn' and title = 'Phone Wallpaper'
 );

insert into public.rewards_catalog
  (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier, in_app_only)
select 'raelynn',
       'Lyric Wallpaper',
       'Exclusive lyric wallpaper for community members.',
       500, 'custom', null, true, 1, null, false
 where not exists (
   select 1 from public.rewards_catalog
    where community_id = 'raelynn' and title = 'Lyric Wallpaper'
 );

-- Behind-the-Song Video 1500 — listed only when clip_url is set.
insert into public.rewards_catalog
  (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier, in_app_only, clip_url)
select 'raelynn',
       'Behind-the-Song Video',
       'Unlock an exclusive behind-the-song clip.',
       1500, 'custom', null, false, 2, null, false, null
 where not exists (
   select 1 from public.rewards_catalog
    where community_id = 'raelynn' and title = 'Behind-the-Song Video'
 );

update public.rewards_catalog
   set description = 'Unlock an exclusive behind-the-song clip.',
       point_cost = 1500,
       kind = 'custom',
       in_app_only = false,
       sort_order = 2,
       requires_tier = null,
       active = (clip_url is not null and length(trim(clip_url)) > 0),
       updated_at = now()
 where community_id = 'raelynn'
   and title = 'Behind-the-Song Video';

-- Fan Spotlight 1000 — in-app only (not a public/web CTA).
insert into public.rewards_catalog
  (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier, in_app_only)
select 'raelynn',
       'Fan Spotlight',
       'Get featured in the in-app fan feed.',
       1000, 'custom', null, true, 3, null, true
 where not exists (
   select 1 from public.rewards_catalog
    where community_id = 'raelynn' and title = 'Fan Spotlight'
 );

update public.rewards_catalog
   set description = 'Get featured in the in-app fan feed.',
       point_cost = 1000,
       kind = 'custom',
       active = true,
       in_app_only = true,
       sort_order = 3,
       requires_tier = null,
       community_id = 'raelynn',
       updated_at = now()
 where title = 'Fan Spotlight'
   and community_id = 'raelynn';

-- Global 0048 Fan Spotlight stays unpublished (unscoped reserve).
update public.rewards_catalog
   set active = false,
       updated_at = now()
 where title = 'Fan Spotlight'
   and community_id is null;

insert into public.rewards_catalog
  (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier, in_app_only)
select 'raelynn',
       'VIP Moment Raffle',
       'Enter a raffle for a VIP moment at the next available show.',
       5000, 'experience', null, true, 4, null, false
 where not exists (
   select 1 from public.rewards_catalog
    where community_id = 'raelynn' and title = 'VIP Moment Raffle'
 );

update public.rewards_catalog
   set description = 'Enter a raffle for a VIP moment at the next available show.',
       point_cost = 5000,
       kind = 'experience',
       active = true,
       in_app_only = false,
       sort_order = 4,
       requires_tier = null,
       updated_at = now()
 where community_id = 'raelynn'
   and title = 'VIP Moment Raffle';


-- ─── 4. Tier perk copy — drop reserved SKUs from the public ladder ────────

update public.tiers
   set perks = '["Welcome badge", "Access to fan home"]'::jsonb
 where slug = 'bronze';

update public.tiers
   set perks = '["Priority digital drops", "Leaderboard boost"]'::jsonb
 where slug = 'silver';

update public.tiers
   set perks = '["Exclusive digital unlocks", "Early event RSVPs"]'::jsonb
 where slug = 'gold';

update public.tiers
   set perks = '["All-access digital catalog", "Priority event RSVPs"]'::jsonb
 where slug = 'platinum';


-- ─── 5. Activity day window (ET, same family as check-ins) ────────────────

create or replace function public.activity_day_start()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (date_trunc('day', timezone('America/New_York', now()))
          at time zone 'America/New_York');
$$;

revoke all on function public.activity_day_start() from public, anon, authenticated;
grant execute on function public.activity_day_start() to postgres, service_role;


-- ─── 6. Comment +10 / cap 5 per ET day → points_ledger ────────────────────

create or replace function public.try_award_comment_points(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_slug   text;
  v_award  int := 10;
  v_cap    int := 5;
  v_today  int;
  v_ref    text := 'community_comment:' || p_comment_id::text;
begin
  select c.author_id, p.artist_slug
    into v_author, v_slug
    from community_comments c
    join community_posts p on p.id = c.post_id
   where c.id = p_comment_id;

  if v_author is null then return false; end if;

  if exists (select 1 from points_ledger where source_ref = v_ref) then
    return false;
  end if;

  select count(*) into v_today
    from points_ledger
   where fan_id = v_author
     and source_ref like 'community_comment:%'
     and created_at >= public.activity_day_start();

  if v_today >= v_cap then return false; end if;

  insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (v_author, v_award, 'challenge', v_ref, v_slug, 'Community comment');

  update fans
     set total_points = coalesce(total_points, 0) + v_award
   where id = v_author;

  perform public.bump_membership_points(v_author, v_slug, v_award);
  return true;
end $$;

create or replace function public.award_community_comment_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.try_award_comment_points(new.id);
  return new;
end $$;

drop trigger if exists community_comments_award_points on public.community_comments;
create trigger community_comments_award_points
  after insert on public.community_comments
  for each row execute function public.award_community_comment_points();


-- ─── 7. Poll vote +10 / cap 3 per ET day → points_ledger ──────────────────

create or replace function public.try_award_poll_points(p_post_id uuid, p_fan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug  text;
  v_award int := 10;
  v_cap   int := 3;
  v_today int;
  v_ref   text := 'poll_vote:' || p_post_id::text || ':' || p_fan_id::text;
begin
  if p_fan_id is null or p_post_id is null then return false; end if;

  select artist_slug into v_slug from community_posts where id = p_post_id;

  if exists (select 1 from points_ledger where source_ref = v_ref) then
    return false;
  end if;

  select count(*) into v_today
    from points_ledger
   where fan_id = p_fan_id
     and source_ref like 'poll_vote:%'
     and created_at >= public.activity_day_start();

  if v_today >= v_cap then return false; end if;

  insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (p_fan_id, v_award, 'challenge', v_ref, v_slug, 'Poll vote');

  update fans
     set total_points = coalesce(total_points, 0) + v_award
   where id = p_fan_id;

  perform public.bump_membership_points(p_fan_id, v_slug, v_award);
  return true;
end $$;

create or replace function public.award_poll_vote_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.try_award_poll_points(new.post_id, new.fan_id);
  return new;
end $$;

drop trigger if exists community_poll_votes_award_points on public.community_poll_votes;
create trigger community_poll_votes_award_points
  after insert on public.community_poll_votes
  for each row execute function public.award_poll_vote_points();


-- ─── 8. Share +15 / cap 3 per ET day (replace the live 50-pt share row) ───

create or replace function public.try_award_share_points(
  p_fan_id uuid,
  p_community_id text,
  p_source_ref text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award int := 15;
  v_cap   int := 3;
  v_today int;
  v_ref   text;
begin
  if p_fan_id is null then return false; end if;
  v_ref := coalesce(nullif(p_source_ref, ''), 'share:' || p_fan_id::text || ':' || gen_random_uuid()::text);

  if exists (select 1 from points_ledger where source_ref = v_ref) then
    return false;
  end if;

  select count(*) into v_today
    from points_ledger
   where fan_id = p_fan_id
     and source = 'social_share'
     and created_at >= public.activity_day_start();

  if v_today >= v_cap then return false; end if;

  insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (p_fan_id, v_award, 'social_share', v_ref, p_community_id, 'In-app share');

  update fans
     set total_points = coalesce(total_points, 0) + v_award
   where id = p_fan_id;

  perform public.bump_membership_points(p_fan_id, p_community_id, v_award);
  return true;
end $$;

create or replace function public.award_share_points(
  p_community_id text default null,
  p_source_ref text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_fan  uuid := auth.uid();
begin
  if v_role = 'anon' or v_fan is null then
    raise exception 'Not authorized';
  end if;
  return public.try_award_share_points(v_fan, p_community_id, p_source_ref);
end $$;

-- Fan-action share CTAs: force +15 and the same daily cap. Other CTA kinds
-- keep their configured point_value (challenges stay as they are).
create or replace function public.award_fan_action_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base  int;
  v_slug  text;
  v_kind  fan_action_kind;
  v_award int;
  v_ref   text;
begin
  select point_value, artist_slug, kind into v_base, v_slug, v_kind
    from fan_actions where id = new.action_id;
  if v_base is null or v_base <= 0 then return new; end if;

  v_ref := 'fan_action:' || new.action_id::text || ':' || new.fan_id::text;
  if exists (select 1 from points_ledger where source_ref = v_ref) then
    return new;
  end if;

  if v_kind = 'share' then
    perform public.try_award_share_points(new.fan_id, v_slug, v_ref);
    new.points_awarded := coalesce(
      (select delta from points_ledger where source_ref = v_ref),
      0
    );
    return new;
  end if;

  v_award := v_base;

  insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (new.fan_id, v_award, 'social_share', v_ref, v_slug, 'CTA completed');

  update fans
     set total_points = coalesce(total_points, 0) + v_award
   where id = new.fan_id;

  perform public.bump_membership_points(new.fan_id, v_slug, v_award);
  new.points_awarded := v_award;
  return new;
end $$;

update public.fan_actions
   set point_value = 15
 where kind = 'share'
   and point_value is distinct from 15;


-- ─── 9. Friend +50 on verified join (do not re-pay referrer +150) ─────────
-- Referrer +150 already fires from onboard awardPoints when the referral
-- row is verified. This trigger only credits the friend.

create or replace function public.try_award_referral_friend_points(
  p_referrer_id uuid,
  p_referred_id uuid,
  p_community_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_friend_ref text := 'referral:friend:' || p_referred_id::text;
begin
  if p_referrer_id is null or p_referred_id is null then return; end if;
  if p_referrer_id = p_referred_id then return; end if;

  if exists (select 1 from points_ledger where source_ref = v_friend_ref) then
    return;
  end if;

  insert into points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (p_referred_id, 50, 'referral', v_friend_ref, p_community_id, 'Joined via referral');

  update fans
     set total_points = coalesce(total_points, 0) + 50
   where id = p_referred_id;

  perform public.bump_membership_points(p_referred_id, p_community_id, 50);
end $$;

create or replace function public.award_referral_friend_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'verified' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'verified' then
    return new;
  end if;
  perform public.try_award_referral_friend_points(
    new.referrer_id,
    new.referred_id,
    new.community_id
  );
  return new;
end $$;

drop trigger if exists referrals_award_join_points on public.referrals;
drop trigger if exists referrals_award_friend_points on public.referrals;
create trigger referrals_award_friend_points
  after insert or update of status on public.referrals
  for each row execute function public.award_referral_friend_points();


-- ─── 10. First 100 Founding Fan (persist number + badge) ──────────────────

update public.badges
   set description = 'One of the first 100 fans to join this community. Separate from paid Founding Fan pricing.'
 where slug = 'founder-fan';

create or replace function public.claim_founding_fan_status(
  p_fan_id uuid,
  p_community_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap   integer := 100;
  v_taken integer;
  v_next  integer;
  v_lock  bigint;
  v_existing integer;
  v_role text := coalesce(auth.role(), '');
begin
  if v_role = 'authenticated' and auth.uid() is distinct from p_fan_id then
    raise exception 'Not authorized';
  end if;
  if v_role = 'anon' then
    raise exception 'Not authorized';
  end if;
  if p_community_id is null then return null; end if;

  v_lock := ('x' || substr(md5('founding-fan:' || p_community_id), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  select founding_fan_number into v_existing
    from fan_community_memberships
   where fan_id = p_fan_id and community_id = p_community_id;

  if v_existing is not null then
    perform public.award_community_badge(p_fan_id, 'founder-fan', p_community_id);
    return v_existing;
  end if;

  select count(*) into v_taken
    from fan_community_memberships
   where community_id = p_community_id
     and founding_fan_number is not null;

  if v_taken >= v_cap then return null; end if;

  v_next := v_taken + 1;

  update fan_community_memberships
     set founding_fan_number = v_next
   where fan_id = p_fan_id
     and community_id = p_community_id
     and founding_fan_number is null;

  if not found then return null; end if;

  perform public.award_community_badge(p_fan_id, 'founder-fan', p_community_id);
  return v_next;
end $$;

-- Backfill numbers for fans who already hold the founder-fan badge (date window).
with ranked as (
  select fb.fan_id,
         row_number() over (order by fb.earned_at, fb.fan_id) as n
    from fan_badges fb
   where fb.badge_slug = 'founder-fan'
     and coalesce(fb.community_id, 'raelynn') = 'raelynn'
)
update fan_community_memberships m
   set founding_fan_number = ranked.n
  from ranked
 where m.fan_id = ranked.fan_id
   and m.community_id = 'raelynn'
   and ranked.n <= 100
   and m.founding_fan_number is null;


-- ─── 11. Lock the new economy column (do not reopen client writes) ────────

revoke update (founding_fan_number)
  on public.fan_community_memberships from public, anon, authenticated;

create or replace function public.reject_client_economy_column_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_table_name = 'fans' then
    if tg_op = 'INSERT' then
      if coalesce(new.total_points, 0) is distinct from 0
         or new.current_tier::text is distinct from 'bronze'
         or new.stripe_customer_id is not null
         or new.referred_by is not null
         or new.suspended is distinct from false
      then
        raise exception 'Cannot set protected fan economy columns';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.total_points is distinct from old.total_points
         or new.current_tier::text is distinct from old.current_tier::text
         or new.stripe_customer_id is distinct from old.stripe_customer_id
         or new.referred_by is distinct from old.referred_by
         or new.referral_code is distinct from old.referral_code
         or new.suspended is distinct from old.suspended
      then
        raise exception 'Cannot modify protected fan economy columns';
      end if;
    end if;
  elsif tg_table_name = 'fan_community_memberships' then
    if tg_op = 'INSERT' then
      if coalesce(new.total_points, 0) is distinct from 0
         or new.current_tier::text is distinct from 'bronze'
         or coalesce(new.subscription_tier, 'free') is distinct from 'free'
         or new.stripe_subscription_id is not null
         or new.is_founder is distinct from false
         or new.founder_number is not null
         or new.founding_fan_number is not null
         or coalesce(new.monthly_credit_cents, 0) is distinct from 0
         or new.billing_period is not null
      then
        raise exception 'Cannot set protected membership economy columns';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.fan_id is distinct from old.fan_id
         or new.community_id is distinct from old.community_id
         or new.joined_at is distinct from old.joined_at
         or new.total_points is distinct from old.total_points
         or new.current_tier::text is distinct from old.current_tier::text
         or new.referral_code is distinct from old.referral_code
         or new.subscription_tier is distinct from old.subscription_tier
         or new.stripe_subscription_id is distinct from old.stripe_subscription_id
         or new.current_period_end is distinct from old.current_period_end
         or new.cancel_at_period_end is distinct from old.cancel_at_period_end
         or new.is_founder is distinct from old.is_founder
         or new.founder_number is distinct from old.founder_number
         or new.founding_fan_number is distinct from old.founding_fan_number
         or new.monthly_credit_cents is distinct from old.monthly_credit_cents
         or new.monthly_credit_refreshed_at is distinct from old.monthly_credit_refreshed_at
         or new.billing_period is distinct from old.billing_period
      then
        raise exception 'Cannot modify protected membership economy columns';
      end if;
    end if;
  end if;

  return new;
end $$;


-- ─── 12. Grants — authenticated may redeem/award as self; never anon ──────

revoke all on function public.try_award_comment_points(uuid) from public, anon, authenticated;
revoke all on function public.try_award_poll_points(uuid, uuid) from public, anon, authenticated;
revoke all on function public.try_award_share_points(uuid, text, text) from public, anon, authenticated;
revoke all on function public.try_award_referral_friend_points(uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.award_share_points(text, text) from public, anon;
grant execute on function public.award_share_points(text, text) to authenticated, service_role;

revoke all on function public.claim_founding_fan_status(uuid, text) from public, anon;
grant execute on function public.claim_founding_fan_status(uuid, text) to authenticated, service_role;

-- redeem_reward stays bound as in 0050 (no anon, caller must be auth.uid()).
revoke all on function public.redeem_reward(uuid, uuid, text) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated, service_role;
