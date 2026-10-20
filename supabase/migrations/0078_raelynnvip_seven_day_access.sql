-- RAELYNNVIP grants 7 days of complimentary access, not an open-ended
-- comp. Redeem (frontend/lib/raelynn-vip-code.ts) writes
-- fan_community_memberships.current_period_end for new redemptions
-- even before this file is applied.
--
-- This file does not update fan_community_memberships and does not
-- touch promo_code_redemptions. Fans who already redeemed keep
-- current_period_end null, which is_premium() below still treats as
-- open-ended access. uses_count is not reset.
--
-- Apply by hand in the Supabase SQL editor, one statement at a time,
-- in order. Fan Engage project: uhovonrljcauaoctypbg.
-- Do not run this from the agent. Do not apply it to production here.

alter table public.promo_codes
  add column if not exists access_days integer;

comment on column public.promo_codes.access_days is
  'Days of access one redemption grants. NULL means open-ended. RAELYNNVIP is capped at 7.';

-- Record the cap on the code row. A tighter access_days already stored
-- is kept. Memberships and redemption rows are not in this statement.
update public.promo_codes
   set access_days = least(coalesce(access_days, 7), 7)
 where upper(code) = 'RAELYNNVIP';

-- Comped access with a period end lasts only until that timestamp.
-- A null period end stays open-ended so existing comps are unchanged.
-- Paid premium and past_due still follow subscription_tier alone.
create or replace function public.is_premium(
  p_fan_id uuid,
  p_community_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from fan_community_memberships
    where fan_id = p_fan_id
      and community_id = p_community_id
      and (
        subscription_tier in ('premium', 'past_due')
        or (
          subscription_tier = 'comped'
          and (
            current_period_end is null
            or current_period_end > now()
          )
        )
      )
  );
$$;

comment on function public.is_premium(uuid, text) is
  'Premium, past_due, or comped. A comped row with current_period_end in the past is not premium. Null current_period_end stays premium.';
