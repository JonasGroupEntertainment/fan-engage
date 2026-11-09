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

-- 5. Remove store-credit sentences from these policy rows. Do not edit
-- monthly_credit_cents or any other credit code.
update public.policy_pages
set content_md = replace(
  content_md,
  'Premium includes a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens.',
  ''
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%Premium includes a $5 monthly store credit on both monthly and yearly plans%';

update public.policy_pages
set content_md = replace(
  content_md,
  'a $5.00 monthly credit applied to the User''s account each billing cycle, redeemable toward marketplace items within that Artist''s community.',
  ''
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%$5.00 monthly credit applied to the User''s account each billing cycle, redeemable toward marketplace items%';

update public.policy_pages
set content_md = replace(
  content_md,
  'a $5.00 monthly credit applied to the User''s account each billing cycle',
  ''
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%$5.00 monthly credit applied to the User''s account each billing cycle%';

update public.policy_pages
set content_md = replace(
  content_md,
  'a $5 monthly store credit on both monthly and yearly plans, redeemable when the FEP store opens',
  ''
)
where slug in ('terms', 'rewards_terms', 'cancellation_refund')
  and content_md like '%a $5 monthly store credit on both monthly and yearly plans%';

-- 6. Rewards terms: drop Rules for Use. Keep the Terms of Use clause.
update public.policy_pages
set content_md = replace(
  replace(
    content_md,
    ' and the Fan Engage Pro Rules for Use and User Content [link]',
    ''
  ),
  'The Fan Engage Pro Rules for Use and User Content [link] also apply to the Fan Engage Pro Reward Program.',
  ''
)
where slug = 'rewards_terms'
  and content_md like '%Rules for Use%';

update public.policy_pages
set content_md = replace(
  content_md,
  '(no public page is published)',
  ''
)
where slug = 'rewards_terms'
  and content_md like '%(no public page is published)%';
