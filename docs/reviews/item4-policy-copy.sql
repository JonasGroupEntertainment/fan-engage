-- Review only. Do not run this from the draft PR.
-- No new tables. No grants.
--
-- /terms, /rewards-terms, and /cancellation-refund render policy_pages
-- rows. getPolicy returns null when the row is missing, so the published
-- row overrides any seed. The app rewrite in
-- frontend/lib/legal/premium-billing-wording.ts applies the same sentences
-- at read time. This file is the matching database update for after review.
-- Privacy (slug = 'privacy') is not updated.

-- 1. Entity name only. Governing law and venue are not changed here.
update public.policy_pages
set content_md = replace(
  content_md,
  'a North Carolina limited liability company',
  'a Colorado limited liability company'
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%a North Carolina limited liability company%';

-- 2. Monthly-only billing cycles on terms.
update public.policy_pages
set content_md = replace(
  content_md,
  'Billing cycles are set on a monthly basis',
  'Billing cycles are monthly or yearly'
)
where slug = 'terms'
  and content_md like '%Billing cycles are set on a monthly basis%';

-- 3. Signup-day charge conflicts with the seven-day trial.
update public.policy_pages
set content_md = replace(
  content_md,
  'We will begin billing your payment method for the Services on the day that you sign up for such Services, regardless of whether you have fully completed your account as of that date.',
  'Premium includes an eligible seven-day free trial, then monthly or yearly billing.'
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%on the day that you sign up for such Services%';

-- 4. 30-day refund window for a new subscription.
update public.policy_pages
set content_md = replace(
  content_md,
  'Refunds are available within 30 days of a new subscription purchase if you have not substantially used the service.',
  'Premium includes an eligible seven-day free trial, then monthly or yearly billing.'
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%Refunds are available within 30 days of a new subscription purchase%'
  and content_md not like '%eligible seven-day free trial, then monthly or yearly billing%';

update public.policy_pages
set content_md = replace(
  content_md,
  'Refunds are available within 30 days of a new subscription purchase if you have not substantially used the service.',
  ''
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%Refunds are available within 30 days of a new subscription purchase%'
  and content_md like '%eligible seven-day free trial, then monthly or yearly billing%';

-- 5. $5 credit. Not "spendable now". Not once per billing cycle.
update public.policy_pages
set content_md = replace(
  content_md,
  'a $5.00 monthly credit applied to the User''s account each billing cycle, redeemable toward marketplace items within that Artist''s community.',
  'a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens'
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%$5.00 monthly credit applied to the User''s account each billing cycle, redeemable toward marketplace items%';

update public.policy_pages
set content_md = replace(
  content_md,
  'a $5.00 monthly credit applied to the User''s account each billing cycle',
  'a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens'
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%$5.00 monthly credit applied to the User''s account each billing cycle%'
  and content_md not like '%redeemable when the FEP store opens%';
