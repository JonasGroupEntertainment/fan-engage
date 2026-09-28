-- Already applied to production via MCP on 2026-09-27.
--
-- 0066_no_multiplier_on_refunds.sql
--
-- Defense in depth for "refunds pay out at 1.5x". 0063 moved redemption
-- cancels into cancel_redemption(), which writes the refund ledger row
-- directly with no multiplier, so the live cancel paths are already correct
-- (prod check 2026-09-27: 0 positive reward_redemption ledger rows).
--
-- apply_points_award() still multiplies every positive delta for a
-- Founding Fan. If any future caller routes a refund through it with
-- source 'reward_redemption', the fan would get 1.5x back. This makes the
-- Founding Fan multiplier apply to earned points only: a reward_redemption
-- row is never multiplied, whatever its sign.
--
-- Body copied from the live production definition (read 2026-09-27) with
-- one added condition. CREATE OR REPLACE keeps the existing grants
-- (EXECUTE for service_role only); they are re-asserted below so the
-- function stays closed even on a fresh database. Idempotent.

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
set search_path to 'public'
as $function$
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
  if not found then raise exception 'Fan not found'; end if;

  if p_source_ref is not null and exists (
    select 1 from public.points_ledger where source_ref = p_source_ref
  ) then
    return 0;
  end if;

  -- The multiplier rewards earned points only. Refunds of spent points
  -- (reward_redemption) go back at face value.
  if p_base_delta > 0
     and p_community_id is not null
     and v_source <> 'reward_redemption' then
    v_mult := public.points_multiplier(p_fan_id, p_community_id);
  end if;

  v_delta := case when p_base_delta < 0 then p_base_delta
                  else round(p_base_delta * v_mult)::integer end;

  if v_mult > 1 and (v_note is null or v_note not ilike '%1.5%') then
    v_note := coalesce(v_note, 'Points') || ' (Founding Fan 1.5x)';
  end if;

  insert into public.points_ledger (fan_id, delta, source, source_ref, community_id, note)
  values (p_fan_id, v_delta, v_source, p_source_ref, p_community_id, v_note);

  perform public.sync_points_from_ledger(p_fan_id);
  return v_delta;
end $function$;

revoke execute on function public.apply_points_award(uuid, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_points_award(uuid, integer, text, text, text, text)
  to service_role;
