-- Staff, team, and internal test accounts stay in the database with their
-- badges and founding_fan_number. They are hidden from the public Founding
-- Fan wall and do not consume one of the 100 spots.
--
-- This migration only adds the flag and updates the claim / multiplier
-- functions. It does NOT mark any fan internal. That data change is
-- scripts/hide-internal-founding-fans.sql, which is not applied automatically.
-- The claim function also excludes the known fan ids so the cap matches the
-- public wall as soon as this migration is applied, even before that script.
--
-- Badge numbers are not renumbered. The next fan receives max(number)+1,
-- so existing numbers stay put and a later public fan can be above 100.
-- Those fans still earn 1.5×. The 100 cap counts public fans only.
--
-- Apply by hand in the Supabase SQL editor. The SQL editor drops later
-- statements in a multi-statement paste — run each statement on its own,
-- in order.

alter table public.fans
  add column if not exists is_internal boolean not null default false;

comment on column public.fans.is_internal is
  'Team, staff, or internal test account. Hidden from the public Founding Fan wall and excluded from the 100-spot counter. Does not delete the account, badge, or founding_fan_number.';

revoke update (is_internal) on table public.fans from anon, authenticated;

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
  -- Same ids as frontend/lib/founding-internal-fans.ts and
  -- scripts/hide-internal-founding-fans.sql.
  v_hidden uuid[] := array[
    'bf02e0cf-b740-407a-9436-222becfc3c49',
    '64aa29d4-a0fc-4653-ae5b-06586c0067a7',
    '84996598-c71a-42a8-812c-a2e3ea642de8',
    '1922bd3c-becc-4cac-afb8-ceeba8666bb4',
    'f198e0e2-5d69-489b-9736-26adf1a690ca',
    'f4c5819f-b340-4b7d-82c9-c5fff973eeb2',
    '094fd522-a559-472b-aab0-1aa49bba8aab',
    '234f4222-fe96-46e2-b403-9ca5fe3ac905',
    '44038dc7-7fb4-431c-86a3-02553a534c35',
    '4b83c23e-775b-455f-b792-e31601e85e5b',
    'e2e3d3ef-824a-4951-8cdc-70ed574c6544'
  ]::uuid[];
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
    if v_existing >= 1 then
      perform public.award_community_badge(p_fan_id, 'founding-fan', p_community_id);
      perform public.award_community_badge(p_fan_id, 'founder-fan', p_community_id);
    end if;
    return v_existing;
  end if;

  select count(*) into v_taken
    from fan_community_memberships m
    join fans f on f.id = m.fan_id
   where m.community_id = p_community_id
     and m.founding_fan_number is not null
     and m.founding_fan_number >= 1
     and coalesce(f.is_internal, false) = false
     and not (m.fan_id = any (v_hidden));

  if v_taken >= v_cap then return null; end if;

  -- Next unused number above every number already issued, including
  -- internal fans. Does not fill gaps and does not renumber anyone.
  select coalesce(max(founding_fan_number), 0) + 1 into v_next
    from fan_community_memberships
   where community_id = p_community_id
     and founding_fan_number is not null;

  if v_next < 1 then
    v_next := 1;
  end if;

  update fan_community_memberships
     set founding_fan_number = v_next
   where fan_id = p_fan_id
     and community_id = p_community_id
     and founding_fan_number is null;

  if not found then return null; end if;

  perform public.award_community_badge(p_fan_id, 'founding-fan', p_community_id);
  perform public.award_community_badge(p_fan_id, 'founder-fan', p_community_id);
  return v_next;
end $$;

comment on function public.claim_founding_fan_status(uuid, text) is
  'Awards the next founding number when fewer than 100 public fans already have one. Internal fans keep their numbers and do not count. Does not renumber.';

revoke all on function public.claim_founding_fan_status(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_founding_fan_status(uuid, text) to service_role;

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
    ) then 1.5
    when public.is_premium(p_fan_id, p_community_id) then 1.5
    else 1.0
  end;
$$;

comment on function public.points_multiplier(uuid, text) is
  '1.5× for any awarded Founding Fan number, or premium. Not stacked. Public cap of 100 is claim_founding_fan_status and ignores internal accounts.';

revoke all on function public.points_multiplier(uuid, text) from public, anon, authenticated;
grant execute on function public.points_multiplier(uuid, text) to service_role;
