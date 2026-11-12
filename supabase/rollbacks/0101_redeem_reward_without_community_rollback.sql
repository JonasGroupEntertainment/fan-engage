-- Rollback for 0101_redeem_reward_without_community.sql
--
-- One statement. Restores redeem_reward with three arguments, as 0100 left
-- it, and the same grants (authenticated and service_role, not anon).
-- Fan Engage Supabase project: uhovonrljcauaoctypbg
--
-- The app only sends the fourth argument for a reward that has no
-- community, so rewards with a community keep working after this rollback.

do $swap$
begin
  drop function if exists public.redeem_reward(uuid, uuid, text, text);
  drop function if exists public.redeem_reward(uuid, uuid, text);

  create function public.redeem_reward(
    p_fan_id uuid,
    p_reward_id uuid,
    p_delivery_details text default null
  )
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
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
end
  $fn$;

  revoke all on function public.redeem_reward(uuid, uuid, text) from public, anon;
  grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated, service_role;
end
$swap$;
