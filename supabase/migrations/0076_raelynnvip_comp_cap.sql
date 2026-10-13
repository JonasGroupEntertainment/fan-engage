-- Cap the RAELYNNVIP complimentary code at 10 uses, expiring at the
-- end of 2026-12-31 UTC.
--
-- Existing promo_code_redemptions rows are left in place, including
-- test redemptions. uses_count is not reset. A tighter max_uses or an
-- earlier expires_at already stored on the row is kept. If the code
-- row is missing, it is inserted with these limits for the raelynn
-- community. Redeem (frontend/lib/raelynn-vip-code.ts) applies the
-- same cap even when this row is looser or not yet updated.
--
-- One statement at a time if pasting into the Supabase SQL editor.

update public.promo_codes
   set max_uses = least(coalesce(max_uses, 10), 10),
       expires_at = least(
         coalesce(expires_at, timestamptz '2026-12-31 23:59:59+00'),
         timestamptz '2026-12-31 23:59:59+00'
       )
 where upper(code) = 'RAELYNNVIP';

insert into public.promo_codes (
  code,
  description,
  grants_tier,
  community_id,
  max_uses,
  uses_count,
  expires_at,
  active
)
select
  'RAELYNNVIP',
  'RaeLynn VIP complimentary access',
  'comped',
  'raelynn',
  10,
  0,
  timestamptz '2026-12-31 23:59:59+00',
  true
where not exists (
  select 1
    from public.promo_codes
   where upper(code) = 'RAELYNNVIP'
);
