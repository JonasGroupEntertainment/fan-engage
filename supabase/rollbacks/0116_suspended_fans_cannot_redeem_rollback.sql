-- Rollback for 0116: redeem_reward as it was before, with no rule for
-- suspended fans.

create or replace function public.redeem_reward(
  p_fan_id uuid,
  p_reward_id uuid,
  p_delivery_details text default null::text,
  p_community_id text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    v_fan_id uuid; v_reward rewards_catalog%rowtype; v_membership fan_community_memberships%rowtype;
    v_redemption_id uuid; v_role text := coalesce(auth.role(), ''); v_balance integer; v_title text;
    v_community text;
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

    -- Which community this spend belongs to. The reward's own community
    -- always wins; the caller's is used only for a reward that has none.
    v_community := coalesce(v_reward.community_id, nullif(btrim(p_community_id), ''));
    if v_community is null then
      raise exception 'Choose a community to redeem this reward';
    end if;
    if v_reward.community_id is null then
      perform 1 from public.fan_community_memberships
       where fan_id = p_fan_id and community_id = v_community;
      if not found then
        raise exception 'Not a member of this community';
      end if;
    end if;

    v_balance := public.fan_ledger_balance(p_fan_id);
    if v_balance < v_reward.point_cost then raise exception 'Insufficient points'; end if;

    if v_reward.requires_tier is not null then
      select * into v_membership from public.fan_community_memberships
       where fan_id = p_fan_id and community_id = v_community for update;
      if v_membership is null then raise exception 'Not a member of this community'; end if;
      if v_reward.requires_tier = 'premium' and v_membership.subscription_tier != 'premium' then
        raise exception 'Premium membership required';
      end if;
      if v_reward.requires_tier = 'founder-only' and v_membership.subscription_tier != 'founder' then
        raise exception 'Founder status required';
      end if;
    end if;

    insert into public.reward_redemptions (fan_id, reward_id, community_id, point_cost, delivery_details, status)
    values (p_fan_id, p_reward_id, v_community, v_reward.point_cost, p_delivery_details, 'pending')
    returning id into v_redemption_id;

    if exists (select 1 from public.points_ledger where source_ref = 'redemption:' || v_redemption_id) then
      raise exception 'Redemption already posted';
    end if;

    insert into public.points_ledger (fan_id, delta, source, source_ref, community_id, note)
    values (p_fan_id, -v_reward.point_cost, 'reward_redemption', 'redemption:' || v_redemption_id, v_community, 'Redeemed: ' || v_reward.title);

    if v_reward.stock is not null then
      update public.rewards_catalog set stock = stock - 1, updated_at = now()
       where id = p_reward_id and stock > 0;
      if not found then raise exception 'Reward is out of stock'; end if;
    end if;

    perform public.sync_points_from_ledger(p_fan_id);

    begin
      perform upsert_notification(p_fan_id, 'reward_redeemed', 'Reward redeemed!',
        'You redeemed ' || v_reward.title || '. Digital unlock is on its way.',
        '/artists/' || v_community || '/rewards', null, 'redemption:' || v_redemption_id, v_community);
    exception when others then null;
    end;
    return v_redemption_id;
  end
  $function$;

revoke execute on function public.redeem_reward(uuid, uuid, text, text) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, text, text) to authenticated, service_role;
