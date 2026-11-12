-- 0101_redeem_reward_without_community.sql
--
-- DRAFT. NOT applied. Do not run this from an agent or from the draft PR.
-- Kevin applies it by hand in the Supabase SQL editor, after 0100.
-- It is one statement. Fan Engage Supabase project: uhovonrljcauaoctypbg
--
-- Why
-- ---
-- A reward can have no community (rewards_catalog.community_id is null; 18
-- "global" rewards on 2026-11-11, all inactive). redeem_reward wrote the
-- reward's community straight into points_ledger, whose community_id is
-- NOT NULL, so redeeming such a reward would fail on the ledger insert with
-- a raw database error.
--
-- No fan can hit this today. reward_is_digitally_redeemable() only allows
-- four named RaeLynn rewards, so every other reward is refused earlier with
-- "Reward is not available to redeem". This migration removes the second
-- blocker so global rewards work once that gate is opened. It does NOT open
-- the gate: which rewards are live is a launch decision.
--
-- What this does
-- --------------
-- redeem_reward gets a fourth argument, p_community_id: the community of
-- the artist page the fan is redeeming on.
--
--   * A reward that has its own community always uses it. The argument is
--     ignored, so a caller cannot move a spend to another community.
--   * A reward with no community uses the argument, and the fan must be a
--     member of that community.
--   * With no community from either side the function refuses with
--     "Choose a community to redeem this reward".
--
-- That one community is written to the redemption (so the right artist
-- team sees it in their queue), to the ledger (so the right membership
-- total goes down, and cancel_redemption refunds to the same place) and to
-- the notification.
--
-- The body is 0100's redeem_reward with those changes. Calls with three
-- arguments keep working. Before applying, compare with
-- pg_get_functiondef() in case the live function changed after 2026-11-11.
--
-- A function's argument list cannot be changed in place, so the old one is
-- dropped and the new one created inside one DO block: one statement, one
-- transaction, no moment without the function. Today authenticated and
-- service_role may execute it and anon may not; that is kept.
-- Rollback: supabase/rollbacks/0101_redeem_reward_without_community_rollback.sql

do $swap$
begin
  drop function if exists public.redeem_reward(uuid, uuid, text);
  drop function if exists public.redeem_reward(uuid, uuid, text, text);

  create function public.redeem_reward(
    p_fan_id uuid,
    p_reward_id uuid,
    p_delivery_details text default null,
    p_community_id text default null
  )
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
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
  $fn$;

  revoke all on function public.redeem_reward(uuid, uuid, text, text) from public, anon;
  grant execute on function public.redeem_reward(uuid, uuid, text, text) to authenticated, service_role;
end
$swap$;

-- ─── Verify (SQL editor) ───────────────────────────────────────────────────
-- select pg_get_function_identity_arguments(oid) from pg_proc
--  where proname = 'redeem_reward';
-- -- Expected: one row, ending in "p_community_id text".
-- select has_function_privilege('anon', oid, 'execute') anon,
--        has_function_privilege('authenticated', oid, 'execute') authenticated
--   from pg_proc where proname = 'redeem_reward';
-- -- Expected: anon false, authenticated true.
