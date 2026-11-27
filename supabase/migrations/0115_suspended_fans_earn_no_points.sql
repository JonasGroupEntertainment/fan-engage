-- 0115_suspended_fans_earn_no_points.sql
--
-- Kevin, 2026-11-27: a suspended fan should stop earning points. Until
-- now "suspended" only stopped posting and commenting.
--
-- Not yet applied to production.
--
-- Every award in the app goes through apply_points_award(), so the rule
-- lives there. For a suspended fan a positive award writes nothing and
-- returns 0, the same answer a duplicate award gets, so no caller needs
-- to change. Still allowed for a suspended fan:
--   - a refund of points they spent (source reward_redemption)
--   - an adjustment the team makes by hand (source manual_adjustment)
--   - points being taken away (a negative amount)
-- Lifting the suspension lets the fan earn again from that moment. Points
-- missed while suspended are not paid back.
--
-- The rest of the function is unchanged from the version in production.
-- Safely re-runnable. Rollback:
-- supabase/rollbacks/0115_suspended_fans_earn_no_points_rollback.sql

create or replace function public.apply_points_award(
  p_fan_id uuid,
  p_base_delta integer,
  p_source text,
  p_source_ref text,
  p_community_id text default null::text,
  p_note text default null::text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mult numeric := 1;
  v_delta integer;
  v_note text := p_note;
  v_source point_source;
  v_founding boolean := false;
  v_suspended boolean := false;
begin
  if p_fan_id is null or p_base_delta is null or p_base_delta = 0 then
    return 0;
  end if;

  begin
    v_source := p_source::point_source;
  exception when invalid_text_representation then
    v_source := 'manual_adjustment';
  end;

  select coalesce(f.suspended, false) into v_suspended
    from public.fans f where f.id = p_fan_id for update;
  if not found then raise exception 'Fan not found'; end if;

  -- A suspended fan earns no new points. Two things still go through: a
  -- refund of points they spent (reward_redemption) and an adjustment the
  -- team makes by hand (manual_adjustment). Points being taken away
  -- (a negative amount) are never blocked.
  if v_suspended
     and p_base_delta > 0
     and v_source not in ('reward_redemption', 'manual_adjustment') then
    return 0;
  end if;

  if p_source_ref is not null and exists (
    select 1 from public.points_ledger where source_ref = p_source_ref
  ) then
    return 0;
  end if;

  if p_base_delta > 0
     and p_community_id is not null
     and v_source <> 'reward_redemption' then
    v_mult := public.points_multiplier(p_fan_id, p_community_id);
    if v_mult > 1 then
      select exists (
        select 1
          from public.fan_community_memberships m
         where m.fan_id = p_fan_id
           and m.community_id = p_community_id
           and m.founding_fan_number is not null
           and m.founding_fan_number >= 1
      ) into v_founding;
    end if;
  end if;

  if p_base_delta < 0 then
    v_delta := p_base_delta;
    v_mult := 1;
  else
    v_delta := round(p_base_delta * v_mult)::integer;
  end if;

  if v_mult > 1 and (v_note is null or v_note not ilike '%1.5%') then
    v_note := coalesce(v_note, 'Points') || case
      when v_founding then ' (Founding Fan 1.5x)'
      else ' (Premium 1.5x)'
    end;
  end if;

  insert into public.points_ledger (
    fan_id, delta, source, source_ref, community_id, note, multiplier
  ) values (
    p_fan_id, v_delta, v_source, p_source_ref, p_community_id, v_note, v_mult
  );

  perform public.sync_points_from_ledger(p_fan_id);
  return v_delta;
end $function$;

revoke execute on function public.apply_points_award(uuid, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_points_award(uuid, integer, text, text, text, text) to service_role;
