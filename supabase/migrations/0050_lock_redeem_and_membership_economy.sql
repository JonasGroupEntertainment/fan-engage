-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — A-P0-2 + A-P0-3: bind redeem_reward; lock economy columns
--
-- Intent (adapted from BEP 0051, not copied): authenticated clients cannot
-- spend another fan's points or inflate points / subscription tier.
-- Service role, postgres, and SECURITY DEFINER (check-in, ledger, redeem,
-- webhook, bump_membership_points) keep working.
--
-- Safe to re-run (idempotent).
-- ────────────────────────────────────────────────────────────────────────────


-- ─── A-P0-1 data repair ────────────────────────────────────────────────────
-- Prior webhook code stamped processed_at even when the handler failed.
-- Unstick those rows so Stripe retries can re-run the handler.
update public.stripe_events
   set processed_at = null
 where processed_at is not null
   and error is not null;


-- ─── A-P0-2. redeem_reward bound to caller ────────────────────────────────
-- Authenticated JWT must redeem only as auth.uid().
-- service_role / postgres (auth.uid() is null) may pass another id for ops.
-- Anon execute is revoked.

create or replace function public.redeem_reward(
  p_fan_id uuid,
  p_reward_id uuid,
  p_delivery_details text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_fan fans%rowtype;
  v_reward rewards_catalog%rowtype;
  v_membership fan_community_memberships%rowtype;
  v_redemption_id uuid;
  v_role text := coalesce(auth.role(), '');
begin
  if v_role = 'authenticated' and auth.uid() is distinct from p_fan_id then
    raise exception 'Not authorized to redeem as another fan';
  end if;

  if v_role = 'anon' then
    raise exception 'Not authorized';
  end if;

  -- Lock the reward row to prevent overselling
  select * into v_reward from rewards_catalog where id = p_reward_id
  for update;

  if v_reward is null then
    raise exception 'Reward not found';
  end if;

  if not v_reward.active then
    raise exception 'Reward is no longer available';
  end if;

  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'Reward is out of stock';
  end if;

  -- Get fan and check total points
  select * into v_fan from fans where id = p_fan_id;
  if v_fan is null then
    raise exception 'Fan not found';
  end if;

  if v_fan.total_points < v_reward.point_cost then
    raise exception 'Insufficient points';
  end if;

  -- Check tier gating if required
  if v_reward.requires_tier is not null then
    select * into v_membership from fan_community_memberships
    where fan_id = p_fan_id and community_id = v_reward.community_id;

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

  -- Insert redemption row
  insert into reward_redemptions (fan_id, reward_id, community_id, point_cost, delivery_details, status)
  values (p_fan_id, p_reward_id, v_reward.community_id, v_reward.point_cost, p_delivery_details, 'pending')
  returning id into v_redemption_id;

  -- Decrement global points
  update fans set total_points = total_points - v_reward.point_cost
  where id = p_fan_id;

  -- Decrement community points if scoped
  if v_reward.community_id is not null then
    update fan_community_memberships
    set total_points = total_points - v_reward.point_cost
    where fan_id = p_fan_id and community_id = v_reward.community_id;
  end if;

  -- Write points ledger
  insert into points_ledger (fan_id, delta, source, source_ref, note)
  values (
    p_fan_id,
    -v_reward.point_cost,
    'reward_redemption',
    'redemption:' || v_redemption_id,
    'Redeemed: ' || v_reward.title
  );

  -- Decrement stock if non-null
  if v_reward.stock is not null then
    update rewards_catalog set stock = stock - 1 where id = p_reward_id;
  end if;

  -- Notify fan
  perform upsert_notification(
    p_fan_id,
    'reward_redeemed',
    'Reward redeemed!',
    'You''ve redeemed ' || v_reward.title || '. An artist will fulfill it soon.',
    '/artists/' || v_reward.community_id || '/rewards',
    null,
    'redemption:' || v_redemption_id
  );

  return v_redemption_id;
end $$;

revoke all on function public.redeem_reward(uuid, uuid, text) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated, service_role;


-- ─── A-P0-3. Column GRANTs + trigger (fans + fan_community_memberships) ───
-- RLS memberships_own_update stays (leave / status). Column privileges and
-- a BEFORE trigger reject economy / billing writes from authenticated/anon.
-- current_user is the session role: PostgREST = authenticated; SECURITY
-- DEFINER RPCs and table-owner SQL = postgres; admin client = service_role.
-- Do NOT mark this trigger SECURITY DEFINER or current_user would be postgres
-- and the guard would never fire.

revoke update (
  total_points,
  current_tier,
  stripe_customer_id,
  referred_by,
  referral_code,
  suspended
) on public.fans from public, anon, authenticated;

revoke update (
  fan_id,
  community_id,
  joined_at,
  total_points,
  current_tier,
  referral_code,
  subscription_tier,
  stripe_subscription_id,
  current_period_end,
  cancel_at_period_end,
  is_founder,
  founder_number,
  monthly_credit_cents,
  monthly_credit_refreshed_at,
  billing_period
) on public.fan_community_memberships from public, anon, authenticated;

grant all on public.fans to service_role;
grant all on public.fan_community_memberships to service_role;

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

drop trigger if exists fans_reject_client_economy_column_changes on public.fans;
create trigger fans_reject_client_economy_column_changes
  before insert or update on public.fans
  for each row execute function public.reject_client_economy_column_changes();

drop trigger if exists memberships_reject_client_economy_column_changes
  on public.fan_community_memberships;
create trigger memberships_reject_client_economy_column_changes
  before insert or update on public.fan_community_memberships
  for each row execute function public.reject_client_economy_column_changes();

revoke all on function public.reject_client_economy_column_changes() from public, anon, authenticated;


-- ─── Verify (SQL editor; do not create probe users) ───────────────────────
-- -- Poisoned webhook rows unstuck?
-- select count(*) as retryable_failed
--   from stripe_events
--  where error is not null and processed_at is not null;
-- -- Expected: 0
--
-- -- redeem_reward grants?
-- select grantee, privilege_type
--   from information_schema.routine_privileges
--  where routine_schema = 'public' and routine_name = 'redeem_reward';
-- -- Expected: authenticated + service_role EXECUTE; no anon / PUBLIC
--
-- -- Protected membership columns not updatable by authenticated?
-- select grantee, column_name, privilege_type
--   from information_schema.column_privileges
--  where table_schema = 'public'
--    and table_name = 'fan_community_memberships'
--    and column_name in ('total_points','current_tier','subscription_tier')
--    and grantee in ('anon','authenticated','PUBLIC');
-- -- Expected: no UPDATE rows
--
-- -- Same for fans.total_points / current_tier / stripe_customer_id
--
-- -- Triggers present?
-- select tgname, tgrelid::regclass
--   from pg_trigger
--  where tgname like '%reject_client_economy_column_changes';
-- -- Expected: fans + fan_community_memberships
