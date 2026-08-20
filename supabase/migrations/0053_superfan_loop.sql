-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — close the RaeLynn superfan loop
--
-- 1) Ledger is the spendable source of truth. redeem_reward locks the fan
--    + SKU, refuses another fan's JWT, and will not double-spend.
-- 2) Founding Fan (first 100 / artist) 1.5× lives in the points writer.
-- 3) Seed one draft poll + one draft team note. Not RaeLynn's voice.
-- 4) Hold VIP Moment Raffle until a real show date exists.
-- 5) RLS: no client inserts on ledger / redemptions; no email leak.
--
-- Safe to re-run (idempotent).
-- Apply via: Supabase SQL editor, or this file in supabase/migrations.
-- ────────────────────────────────────────────────────────────────────────────


-- ─── 0. Columns + helpers that 0051 never recorded on this project ─────────

alter table public.rewards_catalog
  add column if not exists clip_url text;

alter table public.rewards_catalog
  add column if not exists in_app_only boolean not null default false;

alter table public.fan_community_memberships
  add column if not exists founding_fan_number integer;

create unique index if not exists memberships_founding_fan_number_uidx
  on public.fan_community_memberships (community_id, founding_fan_number)
  where founding_fan_number is not null;

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

revoke all on function public.claim_founding_fan_status(uuid, text) from public, anon;
grant execute on function public.claim_founding_fan_status(uuid, text) to authenticated, service_role;

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


-- ─── 1. Catalog: digital live, raffle held, merch stays unpublished ────────

update public.rewards_catalog
   set active = false,
       updated_at = now()
 where title = 'Fan Spotlight'
   and community_id is null;

update public.rewards_catalog
   set active = false,
       updated_at = now()
 where community_id = 'raelynn'
   and title in ('VIP Moment Raffle', 'RaeLynn VIP Moment Raffle');

update public.rewards_catalog
   set active = true,
       in_app_only = false,
       updated_at = now()
 where community_id = 'raelynn'
   and title in ('Phone Wallpaper', 'Exclusive Phone Wallpaper Pack', 'Lyric Wallpaper');

update public.rewards_catalog
   set active = true,
       in_app_only = true,
       updated_at = now()
 where community_id = 'raelynn'
   and title = 'Fan Spotlight';

update public.rewards_catalog
   set active = (clip_url is not null and length(trim(clip_url)) > 0),
       updated_at = now()
 where community_id = 'raelynn'
   and title in ('Behind-the-Song Video', 'RaeLynn Behind-the-Song Video');


-- ─── 2. Founding Fan 1.5× in the writer (cap 100 still holds) ──────────────

create or replace function public.points_multiplier(
  p_fan_id uuid,
  p_community_id text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
        from public.fan_community_memberships m
       where m.fan_id = p_fan_id
         and m.community_id = p_community_id
         and m.founding_fan_number is not null
         and m.founding_fan_number >= 1
         and m.founding_fan_number <= 100
    ) then 1.5
    when public.is_premium(p_fan_id, p_community_id) then 1.5
    else 1.0
  end;
$$;

comment on function public.points_multiplier(uuid, text) is
  '1.5× for Founding Fan #1–100 or premium. Not stacked. Cap is claim_founding_fan_status.';


-- ─── 3. Ledger balance + denorm sync ───────────────────────────────────────

create or replace function public.fan_ledger_balance(p_fan_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated'
     and auth.uid() is distinct from p_fan_id then
    raise exception 'Not authorized to read another fan ledger';
  end if;

  return (
    select coalesce(sum(delta), 0)::integer
      from public.points_ledger
     where fan_id = p_fan_id
  );
end $$;

create or replace function public.sync_points_from_ledger(p_fan_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_row record;
  v_tier tier_slug;
begin
  -- Inline sum — do not call fan_ledger_balance (that RPC is JWT-scoped).
  select coalesce(sum(delta), 0)::integer
    into v_total
    from public.points_ledger
   where fan_id = p_fan_id;

  update public.fans
     set total_points = v_total
   where id = p_fan_id;

  for v_row in
    select m.community_id,
           coalesce((
             select sum(pl.delta)
               from public.points_ledger pl
              where pl.fan_id = p_fan_id
                and pl.community_id = m.community_id
           ), 0)::integer as community_pts
      from public.fan_community_memberships m
     where m.fan_id = p_fan_id
  loop
    select t.slug into v_tier
      from public.tiers t
     where t.min_points <= v_row.community_pts
     order by t.min_points desc
     limit 1;

    update public.fan_community_memberships
       set total_points = v_row.community_pts,
           current_tier = coalesce(v_tier, current_tier)
     where fan_id = p_fan_id
       and community_id = v_row.community_id;
  end loop;

  return v_total;
end $$;


-- ─── 4. Single points writer (earn path) ───────────────────────────────────

create or replace function public.apply_points_award(
  p_fan_id uuid,
  p_base_delta integer,
  p_source text,
  p_source_ref text,
  p_community_id text default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mult numeric := 1.0;
  v_delta integer;
  v_note text := p_note;
  v_source point_source;
begin
  if p_fan_id is null or p_base_delta is null or p_base_delta = 0 then
    return 0;
  end if;

  begin
    v_source := p_source::point_source;
  exception when invalid_text_representation then
    v_source := 'manual_adjustment';
  end;

  perform 1 from public.fans where id = p_fan_id for update;
  if not found then
    raise exception 'Fan not found';
  end if;

  if p_source_ref is not null and exists (
    select 1 from public.points_ledger where source_ref = p_source_ref
  ) then
    return 0;
  end if;

  if p_base_delta > 0 and p_community_id is not null then
    v_mult := public.points_multiplier(p_fan_id, p_community_id);
  end if;

  v_delta := case
    when p_base_delta < 0 then p_base_delta
    else round(p_base_delta * v_mult)::integer
  end;

  if v_mult > 1 and (v_note is null or v_note not ilike '%1.5×%') then
    v_note := coalesce(v_note, 'Points') || ' (Founding Fan 1.5×)';
  end if;

  insert into public.points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (
    p_fan_id,
    v_delta,
    v_source,
    p_source_ref,
    p_community_id,
    v_note
  );

  perform public.sync_points_from_ledger(p_fan_id);
  return v_delta;
end $$;


-- ─── 5. Wire activity awards through the writer ────────────────────────────

create or replace function public.try_award_comment_points(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_slug   text;
  v_ref    text := 'community_comment:' || p_comment_id::text;
  v_today  int;
  v_awarded int;
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

  if v_today >= 5 then return false; end if;

  v_awarded := public.apply_points_award(
    v_author, 10, 'challenge', v_ref, v_slug, 'Community comment'
  );
  return v_awarded <> 0;
end $$;

create or replace function public.try_award_poll_points(p_post_id uuid, p_fan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_ref  text := 'poll_vote:' || p_post_id::text || ':' || p_fan_id::text;
  v_today int;
  v_awarded int;
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

  if v_today >= 3 then return false; end if;

  v_awarded := public.apply_points_award(
    p_fan_id, 10, 'challenge', v_ref, v_slug, 'Poll vote'
  );
  return v_awarded <> 0;
end $$;

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
  v_ref text;
  v_today int;
  v_awarded int;
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

  if v_today >= 3 then return false; end if;

  v_awarded := public.apply_points_award(
    p_fan_id, 15, 'social_share', v_ref, p_community_id, 'In-app share'
  );
  return v_awarded <> 0;
end $$;

create or replace function public.award_community_post_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_points_award(
    new.author_id, 5, 'challenge', 'community_post:' || new.id::text,
    new.artist_slug, 'Community post'
  );
  return new;
end $$;

create or replace function public.award_fan_action_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base int;
  v_slug text;
  v_kind fan_action_kind;
  v_ref  text;
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

  new.points_awarded := public.apply_points_award(
    new.fan_id, v_base, 'social_share', v_ref, v_slug, 'CTA completed'
  );
  return new;
end $$;

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

  perform public.apply_points_award(
    p_referred_id, 50, 'referral', v_friend_ref, p_community_id, 'Joined via referral'
  );
end $$;

-- Prod still fires the pre-0051 wrappers. Point them at the writer.
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


-- ─── 6. Atomic redeem — ledger SoT, own points only, digital SKUs ──────────

create or replace function public.reward_is_digitally_redeemable(p_reward rewards_catalog)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_title text := btrim(p_reward.title);
begin
  if p_reward.community_id is distinct from 'raelynn' then
    return false;
  end if;
  if v_title in ('Phone Wallpaper', 'Exclusive Phone Wallpaper Pack', 'Lyric Wallpaper', 'Fan Spotlight') then
    return p_reward.active;
  end if;
  if v_title = 'Behind-the-Song Video' then
    return p_reward.active
       and p_reward.clip_url is not null
       and length(trim(p_reward.clip_url)) > 0;
  end if;
  return false;
end $$;

create or replace function public.redeem_reward(
  p_fan_id uuid,
  p_reward_id uuid,
  p_delivery_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fan_id uuid;
  v_reward rewards_catalog%rowtype;
  v_membership fan_community_memberships%rowtype;
  v_redemption_id uuid;
  v_role text := coalesce(auth.role(), '');
  v_balance integer;
  v_title text;
begin
  if v_role = 'authenticated' and auth.uid() is distinct from p_fan_id then
    raise exception 'Not authorized to redeem as another fan';
  end if;
  if v_role = 'anon' then
    raise exception 'Not authorized';
  end if;

  -- Lock fan first so two spends cannot both read the same ledger sum.
  select id into v_fan_id from public.fans where id = p_fan_id for update;
  if v_fan_id is null then
    raise exception 'Fan not found';
  end if;

  select * into v_reward from public.rewards_catalog where id = p_reward_id for update;
  if v_reward is null then
    raise exception 'Reward not found';
  end if;

  v_title := btrim(v_reward.title);

  if v_title in ('VIP Moment Raffle', 'RaeLynn VIP Moment Raffle') then
    raise exception 'VIP Moment Raffle is on hold until a show date exists';
  end if;

  if not public.reward_is_digitally_redeemable(v_reward) then
    raise exception 'Reward is not available to redeem';
  end if;

  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'Reward is out of stock';
  end if;

  v_balance := public.fan_ledger_balance(p_fan_id);
  if v_balance < v_reward.point_cost then
    raise exception 'Insufficient points';
  end if;

  if v_reward.requires_tier is not null then
    select * into v_membership from public.fan_community_memberships
     where fan_id = p_fan_id and community_id = v_reward.community_id
     for update;
    if v_membership is null then
      raise exception 'Not a member of this community';
    end if;
    if v_reward.requires_tier = 'premium' and v_membership.subscription_tier != 'premium' then
      raise exception 'Premium membership required';
    end if;
    if v_reward.requires_tier = 'founder-only' and v_membership.subscription_tier != 'founder' then
      raise exception 'Founder status required';
    end if;
  end if;

  insert into public.reward_redemptions (
    fan_id, reward_id, community_id, point_cost, delivery_details, status
  ) values (
    p_fan_id, p_reward_id, v_reward.community_id, v_reward.point_cost,
    p_delivery_details, 'pending'
  ) returning id into v_redemption_id;

  if exists (
    select 1 from public.points_ledger
     where source_ref = 'redemption:' || v_redemption_id
  ) then
    raise exception 'Redemption already posted';
  end if;

  insert into public.points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (
    p_fan_id,
    -v_reward.point_cost,
    'reward_redemption',
    'redemption:' || v_redemption_id,
    v_reward.community_id,
    'Redeemed: ' || v_reward.title
  );

  if v_reward.stock is not null then
    update public.rewards_catalog
       set stock = stock - 1, updated_at = now()
     where id = p_reward_id
       and stock > 0;
    if not found then
      raise exception 'Reward is out of stock';
    end if;
  end if;

  perform public.sync_points_from_ledger(p_fan_id);

  begin
    perform upsert_notification(
      p_fan_id,
      'reward_redeemed',
      'Reward redeemed!',
      'You redeemed ' || v_reward.title || '. Digital unlock is on its way.',
      '/artists/' || v_reward.community_id || '/rewards',
      null,
      'redemption:' || v_redemption_id
    );
  exception when others then
    null;
  end;

  return v_redemption_id;
end $$;


-- ─── 7. RLS / grants — no self-mint, no email leak, own spend only ─────────

revoke all on function public.fan_ledger_balance(uuid) from public, anon;
grant execute on function public.fan_ledger_balance(uuid) to authenticated, service_role;

revoke all on function public.sync_points_from_ledger(uuid) from public, anon, authenticated;
grant execute on function public.sync_points_from_ledger(uuid) to service_role;

revoke all on function public.apply_points_award(uuid, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_points_award(uuid, integer, text, text, text, text) to service_role;

revoke all on function public.reward_is_digitally_redeemable(rewards_catalog) from public, anon, authenticated;
grant execute on function public.reward_is_digitally_redeemable(rewards_catalog) to service_role;

revoke all on function public.redeem_reward(uuid, uuid, text) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated, service_role;

revoke insert, update, delete on public.points_ledger from public, anon, authenticated;
revoke insert, update, delete on public.reward_redemptions from public, anon, authenticated;
revoke insert, update, delete on public.rewards_catalog from public, anon, authenticated;

grant select on public.points_ledger to authenticated;
grant select on public.reward_redemptions to authenticated;
grant select on public.rewards_catalog to authenticated, anon;

drop policy if exists points_ledger_no_client_write on public.points_ledger;
-- No INSERT/UPDATE/DELETE policies on points_ledger: RLS default-deny writes.
-- points_self_select stays. Service role / SECURITY DEFINER bypasses RLS.

drop policy if exists redemptions_client_insert on public.reward_redemptions;
drop policy if exists redemptions_client_update on public.reward_redemptions;

-- Keep email off any public/authenticated cross-fan read.
-- fans_self_select is the only SELECT. get_fan_display_names returns id + first_name only.
revoke all on function public.get_fan_display_names(uuid[]) from public;
grant execute on function public.get_fan_display_names(uuid[]) to anon, authenticated, service_role;

create or replace function public.get_fan_display_names(p_ids uuid[])
returns table (id uuid, first_name text)
language sql
security definer
stable
set search_path = public
as $$
  select f.id, f.first_name
    from public.fans f
   where f.id = any(p_ids);
$$;


-- ─── 8. Backfill founding numbers for early RaeLynn members (cap 100) ──────

with ranked as (
  select fan_id,
         row_number() over (order by joined_at, fan_id) as n
    from public.fan_community_memberships
   where community_id = 'raelynn'
     and founding_fan_number is null
)
update public.fan_community_memberships m
   set founding_fan_number = ranked.n
  from ranked
 where m.fan_id = ranked.fan_id
   and m.community_id = 'raelynn'
   and ranked.n <= 100
   and m.founding_fan_number is null;


-- ─── 9. Placeholder room content — team draft, not RaeLynn ─────────────────

do $$
declare
  v_author uuid := 'bf02e0cf-b740-407a-9436-222becfc3c49';
  v_note_id uuid;
  v_poll_id uuid;
begin
  if not exists (select 1 from public.fans where id = v_author) then
    return;
  end if;

  if not exists (
    select 1 from public.community_posts
     where artist_slug = 'raelynn'
       and title = '[Placeholder / draft] Team note'
  ) then
    insert into public.community_posts (
      artist_slug, author_id, kind, title, body, pinned, visibility, tags
    ) values (
      'raelynn',
      v_author,
      'announcement',
      '[Placeholder / draft] Team note',
      'Draft placeholder from the Fan Engage team. Kevin will replace this with RaeLynn-approved copy. This is not from RaeLynn.',
      true,
      'public',
      array['placeholder','draft']
    )
    returning id into v_note_id;
  end if;

  if not exists (
    select 1 from public.community_posts
     where artist_slug = 'raelynn'
       and title = '[Placeholder / draft] Room poll'
  ) then
    insert into public.community_posts (
      artist_slug, author_id, kind, title, body, pinned, visibility, tags
    ) values (
      'raelynn',
      v_author,
      'poll',
      '[Placeholder / draft] Room poll',
      'Placeholder poll for the room. Kevin will replace the question and options with RaeLynn-approved copy. This is not from RaeLynn.',
      true,
      'public',
      array['placeholder','draft']
    )
    returning id into v_poll_id;

    insert into public.community_poll_options (post_id, label, sort_order)
    values
      (v_poll_id, '[Placeholder] Option A — Kevin will replace', 0),
      (v_poll_id, '[Placeholder] Option B — Kevin will replace', 1),
      (v_poll_id, '[Placeholder] Option C — Kevin will replace', 2);
  end if;
end $$;


-- ─── 10. Heal denorm totals from ledger ────────────────────────────────────

do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.fans loop
    perform public.sync_points_from_ledger(v_id);
  end loop;
end $$;
