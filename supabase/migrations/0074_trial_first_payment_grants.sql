-- Paid perks for a Premium trial (credit, founder slot, referral points)
-- wait for the first invoice that actually collects money. A declined
-- first charge can succeed later, on a Stripe retry or after the fan
-- updates their card, and both invoice.paid and past_due → active try
-- to grant. These statements make that grant safe to run twice, and
-- keep the daily credit cron from paying a fan who is still trialing.
--
-- Does not grant anything by itself. A subscription that ends without
-- a successful charge keeps first_paid_at null.
--
-- Apply by hand in the Supabase SQL editor. The SQL editor drops later
-- statements in a multi-statement paste — run each statement on its own,
-- in order. Not applied by this change.

-- Statement 1: stamp the first real payment. Null means "never paid"
-- (trialing, or the first charge failed and the subscription ended).
alter table public.fan_community_memberships
  add column if not exists first_paid_at timestamptz;

-- Statement 2
comment on column public.fan_community_memberships.first_paid_at is
  'Set when the first Stripe invoice with amount_paid > 0 succeeds. Stays null during a trial and after a decline that never clears, so the credit cron does not pay those fans.';

-- Statement 3: fans can update their own membership row. They must not
-- be able to stamp this themselves and pick up the $5 credit early.
revoke update (first_paid_at) on table public.fan_community_memberships from anon, authenticated;

-- Statement 4: existing paying fans. A 7-day trial's period end is
-- inside 8 days, and a trial is too new for a credit refresh older than
-- 7 days, so those rows stay null and the first real charge can still
-- grant the founder slot and referral points. An established past_due
-- fan (credit refreshed more than 7 days ago) is marked paid so a later
-- dunning recovery does not treat them as a first payment.
update public.fan_community_memberships
   set first_paid_at = coalesce(monthly_credit_refreshed_at, now())
 where first_paid_at is null
   and stripe_subscription_id is not null
   and subscription_tier in ('premium', 'past_due')
   and (
     (
       subscription_tier = 'premium'
       and current_period_end is not null
       and current_period_end > now() + interval '8 days'
     )
     or (
       monthly_credit_refreshed_at is not null
       and monthly_credit_refreshed_at < now() - interval '7 days'
     )
   );

-- Statement 5: one referral-conversion payout per referral. Keeps the
-- earliest ledger row. Subtracts any dropped duplicates from the
-- referrer's total so a double insert cannot inflate the balance.
with ranked as (
  select
    id,
    fan_id,
    delta,
    row_number() over (
      partition by source_ref
      order by created_at asc, id asc
    ) as rn
  from public.points_ledger
  where source = 'referral'
    and source_ref like 'referral_conversion:%'
),
removed as (
  delete from public.points_ledger as p
  using ranked as r
  where p.id = r.id
    and r.rn > 1
  returning r.fan_id, r.delta
),
extra as (
  select fan_id, sum(delta)::integer as points
  from removed
  group by fan_id
)
update public.fans as f
   set total_points = greatest(0, coalesce(f.total_points, 0) - extra.points)
  from extra
 where f.id = extra.fan_id;

-- Statement 6
create unique index if not exists points_ledger_referral_conversion_uidx
  on public.points_ledger (source_ref)
  where source = 'referral'
    and source_ref like 'referral_conversion:%';

-- Statement 7: a second claim for the same fan returns the number they
-- already hold, instead of taking another slot or reporting the cap full
-- and moving them off the founder price.
create or replace function public.claim_founder_slot(
  p_fan_id uuid,
  p_community_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_taken integer;
  v_next integer;
  v_lock bigint;
  v_existing integer;
begin
  if p_fan_id is null or p_community_id is null then
    return null;
  end if;

  v_lock := ('x' || substr(md5(p_community_id), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  select founder_number into v_existing
    from fan_community_memberships
   where fan_id = p_fan_id
     and community_id = p_community_id;

  if v_existing is not null then
    return v_existing;
  end if;

  select founder_cap into v_cap from communities where slug = p_community_id;
  if v_cap is null then return null; end if;

  select count(*) into v_taken
    from fan_community_memberships
   where community_id = p_community_id
     and founder_number is not null;

  if v_taken >= v_cap then return null; end if;

  v_next := v_taken + 1;

  update fan_community_memberships
     set founder_number = v_next,
         is_founder = true
   where fan_id = p_fan_id
     and community_id = p_community_id
     and founder_number is null;

  if not found then
    select founder_number into v_existing
      from fan_community_memberships
     where fan_id = p_fan_id
       and community_id = p_community_id;
    return v_existing;
  end if;

  return v_next;
end $$;

-- Statement 8
revoke all on function public.claim_founder_slot(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_founder_slot(uuid, text) to service_role;
