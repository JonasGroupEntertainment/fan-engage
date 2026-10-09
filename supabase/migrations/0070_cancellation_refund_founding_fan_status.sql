-- Section 3 of the cancellation policy called Founding Fan locked-in
-- pricing. It is a free badge. Sections 1, 2, 4, and 5 are untouched.
--
-- The public page also rewrites this section in
-- frontend/lib/legal/cancellation-refund-founding-status.ts, so /cancellation-refund
-- is correct on deploy even if this statement has not been applied yet.
-- Apply by hand in the Supabase SQL editor (one statement). Not run by Vercel.
--
-- Effective date placeholder: 2026-10-12 (Monday before the Oct 13 email).
-- The rendered Effective and Last updated lines use that same constant.

update public.policy_pages
set
  content_md = regexp_replace(
    content_md,
    E'## 3\\. Founding Fan pricing\\s+Founding Fan pricing is locked in for the lifetime of your continuous subscription\\.\\s*If you cancel and later re-subscribe, you will be billed at the then-current standard rate; the founder slot is not held for returning fans\\.',
    E'## 3. Founding Fan status\n\nFounding Fan status is a free badge offered to the first 100 fans who join an artist''s community. It is not a paid plan and does not change the price of Premium. Founding Fans keep their badge and 1.5× points as long as their account stays active. Premium is a separate optional subscription billed at the rate shown at checkout.',
    'g'
  ),
  effective_date = date '2026-10-12'
where slug = 'cancellation_refund'
  and content_md like '%## 3. Founding Fan pricing%';
