-- 0063_cancel_redemption.sql
--
-- Safe reward cancel. Before this, three server actions cancelled a
-- redemption by flipping its status and then refunding a point cost the
-- browser sent in. Problems:
--   * a fulfilled or already cancelled redemption could be cancelled again,
--     refunding each time;
--   * the refund amount came from the client, not the stored cost;
--   * the admin rewards path went through apply_points_award, which adds the
--     Founding Fan 1.5x to positive deltas, so a refund paid out more than
--     was spent.
--
-- cancel_redemption() does the whole thing in one transaction:
--   lock the redemption row, require status 'pending', optionally require it
--   to belong to the caller's community, mark it cancelled, write exactly one
--   ledger row for the stored point_cost (no multiplier), then resync totals.
--
-- Prod check 2026-09-27: 2 pending redemptions, 0 refund ledger rows, so the
-- refund unique index below builds cleanly.

-- One refund row per redemption, ever.
create unique index if not exists points_ledger_redemption_refund_unique
  on public.points_ledger (source_ref)
  where source_ref like 'redemption:%:refund';

create or replace function public.cancel_redemption(
  p_redemption_id uuid,
  p_community_id text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_redemption public.reward_redemptions%rowtype;
  v_community text;
begin
  select * into v_redemption
    from public.reward_redemptions
   where id = p_redemption_id
   for update;
  if not found then raise exception 'Redemption not found'; end if;

  if p_community_id is not null
     and v_redemption.community_id is distinct from p_community_id then
    raise exception 'Not authorized for this community';
  end if;

  if v_redemption.status <> 'pending' then
    raise exception 'Only pending redemptions can be cancelled';
  end if;

  perform 1 from public.fans where id = v_redemption.fan_id for update;

  -- Refund to the same community the spend came out of.
  select community_id into v_community
    from public.points_ledger
   where source_ref = 'redemption:' || p_redemption_id
   limit 1;
  v_community := coalesce(v_community, v_redemption.community_id);
  if v_community is null then
    raise exception 'Cannot tell which community to refund';
  end if;

  update public.reward_redemptions
     set status = 'cancelled', cancelled_at = now()
   where id = p_redemption_id;

  -- Put the unit back. redeem_reward() takes one off limited stock, so the
  -- cancel gives it back; unlimited rewards (stock is null) are untouched.
  update public.rewards_catalog
     set stock = stock + 1
   where id = v_redemption.reward_id
     and stock is not null;

  if v_redemption.point_cost > 0 then
    insert into public.points_ledger (fan_id, delta, source, source_ref, community_id, note)
    values (
      v_redemption.fan_id,
      v_redemption.point_cost,
      'reward_redemption',
      'redemption:' || p_redemption_id || ':refund',
      v_community,
      'Refunded: redemption cancelled'
    );
    perform public.sync_points_from_ledger(v_redemption.fan_id);
  end if;

  return v_redemption.point_cost;
end $function$;

revoke all on function public.cancel_redemption(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_redemption(uuid, text) to service_role;

notify pgrst, 'reload schema';
