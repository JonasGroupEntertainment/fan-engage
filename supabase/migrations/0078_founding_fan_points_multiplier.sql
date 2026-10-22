-- 0078_founding_fan_points_multiplier.sql
--
-- Founding Fan status is fan_community_memberships.founding_fan_number
-- (any awarded number >= 1). Premium is a separate 1.5× and is not stacked.
-- points_multiplier() already returns 1.5 for either case, and
-- apply_points_award() already called it. These earn paths did not go
-- through that writer, so the promised 1.5× was not on every action:
--   * award_community_badge inserted badges.point_value with no multiplier
--     (the founding-fan badge paid 500, not 750)
--   * award_challenge_entry_points and award_event_rsvp_points multiplied
--     themselves and added onto denormalized totals
--   * the Stripe referral-conversion webhook inserted 500 directly
-- The ledger stored only the final delta. The factor lived in a note.
--
-- apply_points_award() is now the only multiplication. It rounds half
-- away from zero (Postgres round on numeric) and writes the factor on
-- points_ledger.multiplier. Challenge, RSVP, and badge grants pass the
-- base amount in. Spends and reward_redemption refunds stay at face value:
-- cancel_redemption() and redeem_reward() do not call this writer, and a
-- reward_redemption passed in here is not multiplied.
--
-- Does not change existing ledger deltas. Old rows keep multiplier null.
--
-- NOT applied to production by this change.
-- Apply by hand in the Supabase SQL editor, one statement at a time,
-- in order. Fan Engage project: uhovonrljcauaoctypbg.
-- The SQL editor drops later statements in a multi-statement paste.

-- Statement 1
alter table public.points_ledger
  add column if not exists multiplier numeric;

-- Statement 2
comment on column public.points_ledger.multiplier is
  'Factor applied to the base award when this row was written. 1.5 for a Founding Fan or Premium, not stacked. 1 when the writer applied no multiplier, including spends and refunds that go through apply_points_award. Null on rows written before this column, and on redeem_reward / cancel_redemption inserts.';

-- Statement 3
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
  v_mult numeric := 1;
  v_delta integer;
  v_note text := p_note;
  v_source point_source;
  v_founding boolean := false;
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

  -- One multiplication, earned points only. Callers pass the base amount.
  -- Refunds of spent points (reward_redemption) and negative deltas stay
  -- at face value so a cancel cannot pay 1.5× the points that were spent.
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
    -- Half away from zero. 5 → 8, 3 → 5, 1 → 2, 25 → 38.
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

-- Statement 4
revoke execute on function public.apply_points_award(uuid, integer, text, text, text, text)
  from public, anon, authenticated;

-- Statement 5
grant execute on function public.apply_points_award(uuid, integer, text, text, text, text)
  to service_role;

-- Statement 6. Base 3. The writer multiplies once.
create or replace function public.award_challenge_entry_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_slug text;
  ref_id text := 'challenge_entry:' || new.id::text;
begin
  select artist_slug into v_slug from public.community_posts where id = new.post_id;
  perform public.apply_points_award(
    new.fan_id, 3, 'challenge', ref_id, v_slug, 'Challenge submission'
  );
  return new;
end $function$;

-- Statement 7
revoke execute on function public.award_challenge_entry_points()
  from public, anon, authenticated;

-- Statement 8
grant execute on function public.award_challenge_entry_points()
  to service_role;

-- Statement 9. Base 10. The writer multiplies once.
create or replace function public.award_event_rsvp_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_slug text;
  ref_id text := 'event_rsvp:' || new.event_id::text || ':' || new.fan_id::text;
begin
  select artist_slug into v_slug from public.artist_events where id = new.event_id;
  perform public.apply_points_award(
    new.fan_id, 10, 'event_rsvp', ref_id, v_slug, 'RSVPed to event'
  );
  return new;
end $function$;

-- Statement 10
revoke execute on function public.award_event_rsvp_points()
  from public, anon, authenticated;

-- Statement 11
grant execute on function public.award_event_rsvp_points()
  to service_role;

-- Statement 12. Badge point_value is the base. The writer multiplies once
-- and syncs totals. Do not also add to fans.total_points.
create or replace function public.award_community_badge(
  p_fan_id uuid, p_slug text, p_community_id text
) returns boolean
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
    'badge:' || p_slug || ':' || p_community_id
  );

  return true;
end $function$;

-- Statement 13
revoke execute on function public.award_community_badge(uuid, text, text)
  from public, anon, authenticated;

-- Statement 14
grant execute on function public.award_community_badge(uuid, text, text)
  to service_role;

-- Statement 15
notify pgrst, 'reload schema';
