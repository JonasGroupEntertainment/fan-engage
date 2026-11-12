-- 0100_notifications_community.sql
--
-- DRAFT. NOT applied. Do not run this from an agent or from the draft PR.
-- Kevin applies it by hand in the Supabase SQL editor, one numbered
-- statement at a time, in order. Statement 5 only AFTER the code in this
-- PR is deployed. Fan Engage Supabase project: uhovonrljcauaoctypbg
--
-- Why
-- ---
-- 0099 drops the 'raelynn' default on community_id for twelve tables.
-- notifications was left out: three writers did not set the column, and a
-- notification has no parent row a trigger could read the community from.
-- On 2026-11-11 all 3,189 notifications were tagged 'raelynn', including
-- ones for fans who are not in RaeLynn's community.
--
-- What this does
-- --------------
-- 1. A notification may belong to no single community (NULL). A tier badge
--    or a platform notice is not about one artist.
-- 2. upsert_notification gets an eighth argument, p_community_id, and
--    writes it. Calls with seven arguments keep working and write NULL.
-- 3. award_community_badge passes the badge's community.
-- 4. redeem_reward passes the reward's community.
-- 5. The default is dropped.
--
-- The app writers (createNotification and the event-match sender) are
-- changed in this same PR to send community_id themselves.
--
-- Statements 3 and 4 are the functions exactly as they were in production
-- on 2026-11-11 with one argument added to the upsert_notification call.
-- Before applying, compare each with pg_get_functiondef() in case the live
-- function changed after that date.
--
-- No existing row is changed. No new table, so no Data API grants.
-- Rollback: supabase/rollbacks/0100_notifications_community_rollback.sql

-- 1. Allow "no single community".
alter table public.notifications alter column community_id drop not null;

-- 2. Replace upsert_notification. A function's argument list cannot be
--    changed in place, so the old one is dropped and the new one created.
--    Both happen inside one DO block, which is one statement and one
--    transaction: there is no moment when the function does not exist.
--    0062 left this function executable by service_role only; that is kept.
do $swap$
begin
  drop function if exists public.upsert_notification(uuid, text, text, text, text, text, text);
  drop function if exists public.upsert_notification(uuid, text, text, text, text, text, text, text);

  create function public.upsert_notification(
    p_fan_id uuid,
    p_kind text,
    p_title text,
    p_body text default null,
    p_url text default null,
    p_icon text default null,
    p_dedup_key text default null,
    p_community_id text default null
  )
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  begin
    if p_dedup_key is not null then
      if exists (
        select 1 from notifications
        where fan_id = p_fan_id and dedup_key = p_dedup_key
      ) then return; end if;
    end if;
    insert into notifications (fan_id, kind, title, body, url, icon, dedup_key, community_id)
    values (p_fan_id, p_kind, p_title, p_body, p_url, p_icon, p_dedup_key, p_community_id);
  exception when unique_violation then
    -- Race condition: another txn won the dedup. Silently swallow.
    return;
  end
  $fn$;

  revoke all on function public.upsert_notification(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
  grant execute on function public.upsert_notification(uuid, text, text, text, text, text, text, text) to service_role;
end
$swap$;

-- 3. award_community_badge: pass the badge's community to the notification.
--    create or replace keeps the existing grants (service_role only).
create or replace function public.award_community_badge(p_fan_id uuid, p_slug text, p_community_id text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_points   integer;
  v_awarded  integer := 0;
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
    v_awarded := public.apply_points_award(
      p_fan_id,
      v_points,
      'manual_adjustment',
      v_ref,
      p_community_id,
      'Badge earned: ' || p_slug || ' (' || p_community_id || ')'
    );
  end if;

  perform upsert_notification(
    p_fan_id,
    'badge_earned',
    coalesce(v_name, 'Badge earned'),
    case when coalesce(v_awarded, 0) > 0
         then 'You earned ' || v_awarded || ' bonus points.'
         else 'You unlocked a new badge.' end,
    '/rewards',
    v_icon,
    'badge:' || p_slug || ':' || p_community_id,
    p_community_id
  );

  return true;
end $function$;

-- 4. redeem_reward: pass the reward's community to the notification.
--    create or replace keeps the existing grants (authenticated and
--    service_role).
create or replace function public.redeem_reward(p_fan_id uuid, p_reward_id uuid, p_delivery_details text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_fan_id uuid; v_reward rewards_catalog%rowtype; v_membership fan_community_memberships%rowtype;
  v_redemption_id uuid; v_role text := coalesce(auth.role(), ''); v_balance integer; v_title text;
begin
  if v_role = 'authenticated' and auth.uid() is distinct from p_fan_id then
    raise exception 'Not authorized to redeem as another fan';
  end if;
  if v_role = 'anon' then raise exception 'Not authorized'; end if;

  select id into v_fan_id from public.fans where id = p_fan_id for update;
  if v_fan_id is null then raise exception 'Fan not found'; end if;

  select * into v_reward from public.rewards_catalog where id = p_reward_id for update;
  if v_reward is null then raise exception 'Reward not found'; end if;

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
  if v_balance < v_reward.point_cost then raise exception 'Insufficient points'; end if;

  if v_reward.requires_tier is not null then
    select * into v_membership from public.fan_community_memberships
     where fan_id = p_fan_id and community_id = v_reward.community_id for update;
    if v_membership is null then raise exception 'Not a member of this community'; end if;
    if v_reward.requires_tier = 'premium' and v_membership.subscription_tier != 'premium' then
      raise exception 'Premium membership required';
    end if;
    if v_reward.requires_tier = 'founder-only' and v_membership.subscription_tier != 'founder' then
      raise exception 'Founder status required';
    end if;
  end if;

  insert into public.reward_redemptions (fan_id, reward_id, community_id, point_cost, delivery_details, status)
  values (p_fan_id, p_reward_id, v_reward.community_id, v_reward.point_cost, p_delivery_details, 'pending')
  returning id into v_redemption_id;

  if exists (select 1 from public.points_ledger where source_ref = 'redemption:' || v_redemption_id) then
    raise exception 'Redemption already posted';
  end if;

  insert into public.points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (p_fan_id, -v_reward.point_cost, 'reward_redemption', 'redemption:' || v_redemption_id, v_reward.community_id, 'Redeemed: ' || v_reward.title);

  if v_reward.stock is not null then
    update public.rewards_catalog set stock = stock - 1, updated_at = now()
     where id = p_reward_id and stock > 0;
    if not found then raise exception 'Reward is out of stock'; end if;
  end if;

  perform public.sync_points_from_ledger(p_fan_id);

  begin
    perform upsert_notification(p_fan_id, 'reward_redeemed', 'Reward redeemed!',
      'You redeemed ' || v_reward.title || '. Digital unlock is on its way.',
      '/artists/' || v_reward.community_id || '/rewards', null, 'redemption:' || v_redemption_id, v_reward.community_id);
  exception when others then null;
  end;
  return v_redemption_id;
end $function$;

-- 5. Drop the default. Only after the app code in this PR is live.
alter table public.notifications alter column community_id drop default;

-- ─── Verify (SQL editor) ───────────────────────────────────────────────────
-- select table_name from information_schema.columns
--  where table_schema = 'public' and column_default like '%raelynn%';
-- -- Expected after 0099 and 0100: no rows.
--
-- select pg_get_function_identity_arguments(oid) from pg_proc
--  where proname = 'upsert_notification';
-- -- Expected: one row, ending in "p_community_id text".
