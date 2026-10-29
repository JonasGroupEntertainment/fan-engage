-- 0088_follow_join_sync.sql
--
-- Follow = Join. Idempotent. Apply one statement at a time in the SQL editor
-- (it silently drops statements from multi-statement scripts).
--
-- A fan's relationship to an artist lives in two tables that nothing kept in
-- sync: public.fan_artist_following (0006 — read by Fan Home, digests,
-- notifications, streaks, Day One stamps) and public.fan_community_memberships
-- (0011 — read by points, tiers, entitlements, founding fans, rewards,
-- leaderboards). On Fan Engage an artist community's slug IS the artist slug
-- (communities.slug == artists.slug), so the two tables describe the same
-- relationship. A fan who followed from the artist page had no membership and
-- hit paywalls / never appeared on leaderboards; a fan who joined at
-- onboarding followed nobody and got no artist notifications. Ported from
-- Brand Engage Pro 0081_follow_join_sync.sql (members/brands → fans/artists/
-- communities; every column name audited against 0006 and 0011).
--
-- Membership is the record of truth. Following is a projection of it:
--   * AFTER INSERT on fan_artist_following      → upsert an active membership
--     when a public.communities row with that slug exists
--   * AFTER INSERT on fan_community_memberships → upsert a following row when
--     a public.artists row with that slug exists and the membership is active
--   * one-time backfill in both directions (ON CONFLICT DO NOTHING)
--
-- DELETES ARE NOT MIRRORED. Unfollow removes only the following row. The
-- membership row carries total_points / lifetime_points / current_tier /
-- founding_fan_number / Stripe state — destroying it on unfollow would wipe
-- a points balance. A fan who unfollows keeps their membership and can
-- re-follow at any time (the following insert then hits an existing
-- membership and does nothing). Likewise leaving a community (status change
-- or row delete) never touches the follow.
--
-- No recursion. following-insert → trigger → membership insert ON CONFLICT DO
-- NOTHING → (new row) → trigger → following insert ON CONFLICT DO NOTHING.
-- That last insert conflicts with the row whose AFTER INSERT we are inside
-- (it is already visible in the transaction), so Postgres inserts nothing,
-- and an AFTER INSERT ... FOR EACH ROW trigger only fires for rows actually
-- inserted — a DO NOTHING conflict fires no row trigger. The chain therefore
-- terminates after at most one hop in each direction. The same holds starting
-- from a membership insert. Note the BEFORE INSERT triggers on memberships
-- (memberships_reject_client_economy_column_changes from 0050,
-- memberships_update_tier from 0085) still run for the mirrored insert even
-- when it conflicts; the first is a no-op here because current_user inside a
-- SECURITY DEFINER function is the owner, not authenticated/anon, and the
-- mirrored row carries no economy columns anyway.
--
-- Other triggers on these tables (checked, no collision):
--   fan_artist_following      — network_day_one_follow (AFTER INSERT, 20260724
--                               day_one_engine; it swallows its own errors)
--   fan_community_memberships — fan_community_memberships_mirror_street_team
--                               (AFTER INSERT OR UPDATE OF status, 0011; only
--                               acts on community_id = 'street-team'),
--                               memberships_reject_client_economy_column_changes
--                               (BEFORE, 0050), memberships_update_tier
--                               (BEFORE, 0085)
--
-- referral_code on fan_community_memberships is left NULL. The app reads
-- fans.referral_code (0001, default encode(gen_random_bytes(6),'hex')) for
-- invite links; the membership column has no generator and the onboarding
-- route's own upsert (app/api/fan-engage/onboard/route.ts) never sets it.
-- total_points / current_tier take their defaults (0 / 'bronze').

-- ── membership → following ───────────────────────────────────────────────
create or replace function public.sync_following_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and exists (select 1 from public.artists a where a.slug = new.community_id) then
    insert into public.fan_artist_following (fan_id, artist_slug, followed_at)
    values (new.fan_id, new.community_id, coalesce(new.joined_at, now()))
    on conflict (fan_id, artist_slug) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_following_from_membership() from public, anon, authenticated;

drop trigger if exists trg_sync_following_from_membership
  on public.fan_community_memberships;

create trigger trg_sync_following_from_membership
  after insert on public.fan_community_memberships
  for each row execute function public.sync_following_from_membership();

-- ── following → membership ───────────────────────────────────────────────
create or replace function public.sync_membership_from_following()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.communities c where c.slug = new.artist_slug) then
    insert into public.fan_community_memberships
      (fan_id, community_id, joined_at, status)
    values (new.fan_id, new.artist_slug, coalesce(new.followed_at, now()), 'active')
    on conflict (fan_id, community_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_membership_from_following() from public, anon, authenticated;

drop trigger if exists trg_sync_membership_from_following
  on public.fan_artist_following;

create trigger trg_sync_membership_from_following
  after insert on public.fan_artist_following
  for each row execute function public.sync_membership_from_following();

-- ── backfill: memberships → following ────────────────────────────────────
-- network_day_one_follow (20260724133559) stamps every new follow row as a
-- Day One arrival with a fresh cohort/rank. Months-old members backfilled
-- here are not arriving today, so the trigger is paused for this one
-- statement and re-enabled right after. Sized on prod 2026-10-29: ~1,525
-- active members (mostly CSV imports) had no follow row; 33 follows had no
-- membership. The mirrored insert inside trg_sync_* still runs with the
-- trigger on, which is correct for genuinely new follows.
alter table public.fan_artist_following disable trigger network_day_one_follow;

insert into public.fan_artist_following (fan_id, artist_slug, followed_at)
select m.fan_id, m.community_id, coalesce(m.joined_at, now())
  from public.fan_community_memberships m
  join public.artists a on a.slug = m.community_id
 where m.status = 'active'
on conflict (fan_id, artist_slug) do nothing;

alter table public.fan_artist_following enable trigger network_day_one_follow;

-- ── backfill: following → memberships ────────────────────────────────────
insert into public.fan_community_memberships (fan_id, community_id, joined_at, status)
select f.fan_id, f.artist_slug, coalesce(f.followed_at, now()), 'active'
  from public.fan_artist_following f
  join public.communities c on c.slug = f.artist_slug
on conflict (fan_id, community_id) do nothing;

-- ─── Verify (SQL editor; do not create probe users) ───────────────────────
-- -- Both triggers installed?
-- select tgname, tgrelid::regclass, tgenabled
--   from pg_trigger
--  where tgname in ('trg_sync_following_from_membership', 'trg_sync_membership_from_following');
-- -- Expected: 2 rows, tgenabled = 'O'
--
-- -- Active artist members with no follow row? (should be 0 after backfill)
-- select count(*) from fan_community_memberships m
--   join artists a on a.slug = m.community_id
--  where m.status = 'active'
--    and not exists (select 1 from fan_artist_following f
--                     where f.fan_id = m.fan_id and f.artist_slug = m.community_id);
--
-- -- Followers of a community artist with no membership? (should be 0)
-- select count(*) from fan_artist_following f
--   join communities c on c.slug = f.artist_slug
--  where not exists (select 1 from fan_community_memberships m
--                     where m.fan_id = f.fan_id and m.community_id = f.artist_slug);
--
-- -- Trigger functions not callable by clients?
-- select grantee, privilege_type from information_schema.routine_privileges
--  where routine_name in ('sync_following_from_membership', 'sync_membership_from_following')
--    and grantee in ('anon', 'authenticated', 'PUBLIC');
-- -- Expected: 0 rows
