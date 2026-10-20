-- Founding Fan 48-hour early RSVP.
-- Numbered 0079. 0078 is already used by other open PRs.
--
-- artist_events.rsvp_opens_at is when RSVP opens for everyone else.
-- A fan with founding_fan_number >= 1 (the same rule as
-- isFoundingFanNumber / points_multiplier) can RSVP 48 hours earlier.
-- Null means RSVP is already open — existing events stay open.
--
-- Editors, admins, owners, and super-admins (admin_users.community_id
-- = '*') can still insert an RSVP. Viewers cannot skip the window.
-- service_role inserts (the app's admin client) are allowed so an
-- ADMIN_EMAILS operator can manage RSVPs too. Cancelling an RSVP is
-- not gated.
--
-- NOT APPLIED. Do not run this against production from an agent.
-- Apply by hand in the Supabase SQL editor, one statement at a time,
-- in order. Fan Engage project: uhovonrljcauaoctypbg.

alter table public.artist_events
  add column if not exists rsvp_opens_at timestamptz;

comment on column public.artist_events.rsvp_opens_at is
  'When RSVP opens for everyone. Founding Fans (founding_fan_number >= 1) can RSVP 48 hours earlier. Null means RSVP is open now.';

create or replace function public.enforce_event_rsvp_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_community text;
  v_opens timestamptz;
  v_founding boolean;
  v_role text := coalesce(auth.role(), '');
begin
  -- Admin client writes (capacity and points triggers still run).
  if v_role = 'service_role' then
    return new;
  end if;

  select e.artist_slug, e.community_id, e.rsvp_opens_at
    into v_slug, v_community, v_opens
    from public.artist_events e
   where e.id = new.event_id;

  v_community := coalesce(nullif(btrim(coalesce(v_slug, '')), ''), v_community);

  if v_community is not null and exists (
    select 1
      from public.admin_users au
     where au.user_id = auth.uid()
       and (au.community_id = v_community or au.community_id = '*')
       and au.role in ('owner', 'admin', 'editor')
  ) then
    return new;
  end if;

  -- No scheduled open, or the public window has started.
  if v_opens is null or now() >= v_opens then
    return new;
  end if;

  -- Same founding check as frontend isFoundingFanNumber: any awarded
  -- number >= 1, including numbers above the public cap of 100.
  -- Not the paid founder flag.
  v_founding := exists (
    select 1
      from public.fan_community_memberships m
     where m.fan_id = new.fan_id
       and m.community_id = v_community
       and m.founding_fan_number is not null
       and m.founding_fan_number >= 1
  );

  if v_founding and now() >= v_opens - interval '48 hours' then
    return new;
  end if;

  raise exception 'RSVP is not open yet';
end $$;

drop trigger if exists event_rsvps_enforce_rsvp_window on public.event_rsvps;

create trigger event_rsvps_enforce_rsvp_window
  before insert on public.event_rsvps
  for each row execute function public.enforce_event_rsvp_window();

comment on function public.enforce_event_rsvp_window() is
  'Blocks event_rsvps inserts until rsvp_opens_at, except Founding Fans (48 hours early), editor+ admins, and service_role.';
