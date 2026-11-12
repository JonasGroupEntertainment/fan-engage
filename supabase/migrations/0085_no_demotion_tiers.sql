-- 0085_no_demotion_tiers.sql
--
-- Tier is earned, not held: it follows lifetime points earned, and spending
-- never demotes.
--
-- Problem. redeem_reward subtracts the reward cost from fans.total_points and
-- fan_community_memberships.total_points (0021/0050) and, since 0053, writes
-- the negative ledger row and calls sync_points_from_ledger. Two places then
-- recompute tier from the NET balance:
--   * fans_update_tier (0004) — BEFORE UPDATE OF total_points on fans,
--     update_fan_tier() picks the tier whose min_points <= total_points.
--   * sync_points_from_ledger (0053) — recomputes each membership's
--     current_tier from SUM(delta) for that community, and
--     bump_membership_points (0045) does the same from total_points.
-- A Silver fan who redeemed a 500-pt reward dropped back to Bronze.
--
-- Approach (ported from Brand Engage Pro 0082): a stored `lifetime_points`
-- column on fans and fan_community_memberships, kept current by a BEFORE
-- trigger on total_points itself so every writer is covered — apply_points_
-- award / sync_points_from_ledger (0053, 0066, 0078), bump_membership_points
-- (0045/0051), the legacy award triggers, cancel_redemption (0063), the
-- imported-fan backfills. Any positive change to total_points adds the same
-- amount to lifetime_points; decrements (redemptions) leave it alone. Tier is
-- then computed from lifetime_points and only ever moves up.
--
-- Not a SUM(delta) WHERE delta > 0 view over points_ledger because not every
-- historical grant reached the ledger (pre-0053 triggers wrote fans.total_
-- points directly in places), so a pure ledger aggregate would under-count
-- some fans and demote them on first recompute. The backfill floors lifetime
-- at the current balance and at the current tier's threshold so nobody moves
-- down.
--
-- Interaction with sync_points_from_ledger: redefined below with the same
-- signature. It still rewrites fans.total_points and each membership's
-- total_points from the ledger, but no longer writes current_tier — the
-- membership trigger does that from lifetime_points. Callers (apply_points_
-- award, cancel_redemption, redeem_reward, the 0078 multiplier path) are
-- untouched. Even if an older copy of the function were somehow re-applied,
-- the BEFORE trigger runs on the same UPDATE (it names total_points) and
-- re-promotes the row to its lifetime tier, so a demotion cannot persist.
--
-- Known rounding: a cancel_redemption refund raises total_points and so also
-- raises lifetime_points by the refunded amount. Accepted (same as BEP).
--
-- No enum changes. Idempotent: safe to re-run.

-- ------------------------------------------------------------ 1. columns
alter table public.fans
  add column if not exists lifetime_points integer not null default 0;

alter table public.fan_community_memberships
  add column if not exists lifetime_points integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fans_lifetime_points_nonneg'
      and conrelid = 'public.fans'::regclass
  ) then
    alter table public.fans
      add constraint fans_lifetime_points_nonneg check (lifetime_points >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'fan_community_memberships_lifetime_points_nonneg'
      and conrelid = 'public.fan_community_memberships'::regclass
  ) then
    alter table public.fan_community_memberships
      add constraint fan_community_memberships_lifetime_points_nonneg
      check (lifetime_points >= 0);
  end if;
end $$;

-- Clients cannot write it. 0050 column-granted UPDATE on both tables, so a
-- new column is only writable by roles with table-level UPDATE; make that
-- explicit anyway.
revoke update (lifetime_points) on public.fans from public, anon, authenticated;
revoke update (lifetime_points) on public.fan_community_memberships from public, anon, authenticated;

-- --------------------------------------------------------- 2. fan trigger
-- Replaces update_fan_tier (0004). Fires before insert and before any update
-- that names total_points or lifetime_points. Accrues lifetime from positive
-- total_points movement, then promotes (never demotes) the tier.
create or replace function public.update_fan_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_tier tier_slug;
  v_new_min integer;
  v_cur_min integer;
begin
  if tg_op = 'INSERT' then
    -- A row created with points already on it (seed, import) starts with
    -- that much lifetime.
    new.lifetime_points := greatest(coalesce(new.lifetime_points, 0), coalesce(new.total_points, 0));
  else
    if coalesce(new.total_points, 0) > coalesce(old.total_points, 0) then
      new.lifetime_points := coalesce(new.lifetime_points, 0)
        + (coalesce(new.total_points, 0) - coalesce(old.total_points, 0));
    end if;
    -- Lifetime only grows.
    new.lifetime_points := greatest(coalesce(new.lifetime_points, 0), coalesce(old.lifetime_points, 0));
  end if;

  select slug, min_points into v_new_tier, v_new_min
    from tiers
   where min_points <= coalesce(new.lifetime_points, 0)
   order by min_points desc
   limit 1;

  if v_new_tier is not null and v_new_tier is distinct from new.current_tier then
    select min_points into v_cur_min from tiers where slug = new.current_tier;
    if v_cur_min is null or v_new_min > v_cur_min then
      new.current_tier := v_new_tier;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.update_fan_tier() from public, anon, authenticated;

drop trigger if exists fans_update_tier on public.fans;
create trigger fans_update_tier
  before insert or update of total_points, lifetime_points on public.fans
  for each row execute function public.update_fan_tier();

-- -------------------------------------------------- 3. membership trigger
-- Same rule for the per-community row. Takes over the tier write that
-- sync_points_from_ledger (0053) and bump_membership_points (0045) used to
-- do from the net balance.
create or replace function public.update_membership_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_tier tier_slug;
  v_new_min integer;
  v_cur_min integer;
begin
  if tg_op = 'INSERT' then
    new.lifetime_points := greatest(coalesce(new.lifetime_points, 0), coalesce(new.total_points, 0));
  else
    if coalesce(new.total_points, 0) > coalesce(old.total_points, 0) then
      new.lifetime_points := coalesce(new.lifetime_points, 0)
        + (coalesce(new.total_points, 0) - coalesce(old.total_points, 0));
    end if;
    new.lifetime_points := greatest(coalesce(new.lifetime_points, 0), coalesce(old.lifetime_points, 0));
  end if;

  select slug, min_points into v_new_tier, v_new_min
    from tiers
   where min_points <= coalesce(new.lifetime_points, 0)
   order by min_points desc
   limit 1;

  if v_new_tier is not null and v_new_tier is distinct from new.current_tier then
    select min_points into v_cur_min from tiers where slug = new.current_tier;
    if v_cur_min is null or v_new_min > v_cur_min then
      new.current_tier := v_new_tier;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.update_membership_tier() from public, anon, authenticated;

drop trigger if exists memberships_update_tier on public.fan_community_memberships;
create trigger memberships_update_tier
  before insert or update of total_points, lifetime_points on public.fan_community_memberships
  for each row execute function public.update_membership_tier();

-- ------------------------------------------- 4. sync_points_from_ledger
-- Same signature as 0053. Balances still come from the ledger; the tier
-- write is gone (the trigger above owns it).
create or replace function public.sync_points_from_ledger(p_fan_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_row record;
begin
  -- Inline sum — do not call fan_ledger_balance (that RPC is JWT-scoped).
  select coalesce(sum(delta), 0)::integer
    into v_total
    from public.points_ledger
   where fan_id = p_fan_id;

  update public.fans
     set total_points = v_total
   where id = p_fan_id;

  for v_row in
    select m.community_id,
           coalesce((
             select sum(pl.delta)
               from public.points_ledger pl
              where pl.fan_id = p_fan_id
                and pl.community_id = m.community_id
           ), 0)::integer as community_pts
      from public.fan_community_memberships m
     where m.fan_id = p_fan_id
  loop
    -- current_tier is intentionally not written here: memberships_update_tier
    -- (above) promotes from lifetime_points and never demotes.
    update public.fan_community_memberships
       set total_points = v_row.community_pts
     where fan_id = p_fan_id
       and community_id = v_row.community_id;
  end loop;

  return v_total;
end $$;

revoke all on function public.sync_points_from_ledger(uuid) from public, anon, authenticated;
grant execute on function public.sync_points_from_ledger(uuid) to service_role;

-- -------------------------------------------- 5. bump_membership_points
-- Same signature as 0045 (the 0051 award functions call it). It only moves
-- the balance now; the trigger above handles lifetime and tier.
create or replace function public.bump_membership_points(
  p_fan_id uuid, p_community_id text, p_delta int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_community_id is null or p_delta = 0 then return; end if;

  -- Only update an existing membership; earning points in a community you
  -- never joined does not create a membership.
  update fan_community_memberships
     set total_points = greatest(coalesce(total_points, 0) + p_delta, 0)
   where fan_id = p_fan_id and community_id = p_community_id;
end $$;

revoke all on function public.bump_membership_points(uuid, text, int) from public, anon, authenticated;
grant execute on function public.bump_membership_points(uuid, text, int) to service_role;

-- ------------------------------------------------------------ 6. backfill
-- lifetime = max(positive ledger deltas, current balance, current tier's
-- threshold). The explicit SET of lifetime_points fires the triggers above,
-- which promote anyone whose lifetime already clears a higher tier.
with earned as (
  select fan_id, sum(delta)::integer as pts
    from public.points_ledger
   where delta > 0
   group by fan_id
),
target as (
  select f.id,
         greatest(
           coalesce(e.pts, 0),
           coalesce(f.total_points, 0),
           coalesce(t.min_points, 0)
         ) as lifetime
    from public.fans f
    left join earned e on e.fan_id = f.id
    left join public.tiers t on t.slug = f.current_tier
)
update public.fans f
   set lifetime_points = x.lifetime
  from target x
 where x.id = f.id
   and coalesce(f.lifetime_points, 0) < x.lifetime;

with earned as (
  select fan_id, community_id, sum(delta)::integer as pts
    from public.points_ledger
   where delta > 0 and community_id is not null
   group by fan_id, community_id
),
target as (
  select m.fan_id, m.community_id,
         greatest(
           coalesce(e.pts, 0),
           coalesce(m.total_points, 0),
           coalesce(t.min_points, 0)
         ) as lifetime
    from public.fan_community_memberships m
    left join earned e
      on e.fan_id = m.fan_id and e.community_id = m.community_id
    left join public.tiers t on t.slug = m.current_tier
)
update public.fan_community_memberships m
   set lifetime_points = x.lifetime
  from target x
 where x.fan_id = m.fan_id and x.community_id = m.community_id
   and coalesce(m.lifetime_points, 0) < x.lifetime;

notify pgrst, 'reload schema';

-- ─── Verify (SQL editor) ───────────────────────────────────────────────────
-- select tgname, tgrelid::regclass from pg_trigger
--  where tgname in ('fans_update_tier', 'memberships_update_tier');
-- -- Expected: one row each
--
-- select count(*) from public.fan_community_memberships m
--   join public.tiers t on t.slug = m.current_tier
--  where m.lifetime_points < t.min_points;
-- -- Expected: 0
