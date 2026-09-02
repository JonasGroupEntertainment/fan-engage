-- 0055_founding_fan_free_badge.sql
-- Founding Fan is a free first-100 join badge, not Premium.
-- Counters already use founding_fan_number 1–100. Award path must match.

update public.badges
   set description = 'One of the first 100 fans to join this community. Free badge — not a Premium purchase.',
       tier = 'free'
 where slug in ('founding-fan', 'founder-fan');

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
    if v_existing >= 1 and v_existing <= v_cap then
      perform public.award_community_badge(p_fan_id, 'founding-fan', p_community_id);
      perform public.award_community_badge(p_fan_id, 'founder-fan', p_community_id);
    end if;
    return v_existing;
  end if;

  select count(*) into v_taken
    from fan_community_memberships
   where community_id = p_community_id
     and founding_fan_number is not null
     and founding_fan_number >= 1
     and founding_fan_number <= v_cap;

  if v_taken >= v_cap then return null; end if;

  v_next := v_taken + 1;

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

revoke all on function public.claim_founding_fan_status(uuid, text) from public, anon;
grant execute on function public.claim_founding_fan_status(uuid, text) to authenticated, service_role;

-- Backfill: anyone already numbered 1–100 gets the free Founding Fan badge.
insert into public.fan_badges (fan_id, badge_slug, community_id)
select m.fan_id, slug.badge_slug, m.community_id
  from public.fan_community_memberships m
  cross join (values ('founding-fan'), ('founder-fan')) as slug(badge_slug)
 where m.founding_fan_number is not null
   and m.founding_fan_number >= 1
   and m.founding_fan_number <= 100
   and exists (select 1 from public.badges b where b.slug = slug.badge_slug)
on conflict (fan_id, badge_slug, community_id) do nothing;
