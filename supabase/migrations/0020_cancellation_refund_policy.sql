-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — Cancellation & Refund Policy
-- Safe to re-run (idempotent).
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Seed cancellation & refund policy (upsert; safe to re-run) ────────────
insert into public.policy_pages (slug, title, content_md, is_draft) values
  ('cancellation_refund', 'Cancellation & Refund Policy',
   E'# Cancellation & Refund Policy — DRAFT\n\n_This is a placeholder. Final policy pending legal review._\n\n' ||
   E'## 1. Subscription cancellation\nYou may cancel your Fan Engage subscription at any time via your account settings or by contacting support@fanengage.app.\n\n' ||
   E'Cancellation takes effect at the end of your current billing period. You will retain access to premium features until that date.\n\n' ||
   E'## 2. Refund eligibility\nPremium includes an eligible seven-day free trial, then monthly or yearly billing.\n\n' ||
   E'Refunds are not available for past billing periods or for services already rendered. Points and rewards redeemed or earned under a subscription cannot be refunded.\n\n' ||
   E'## 3. Founder tier proration\nFor Founder Tier members: if you downgrade during a billing period, any unused days will be prorated at the monthly rate and credited toward your next billing cycle, subject to review by the support team.\n\n' ||
   E'## 4. Contact\nTo request a refund or to discuss your cancellation, please email support@fanengage.app with your account email and the reason for your request.\n\n' ||
   E'Disputes or escalations may be sent to legal@fanengage.app.',
   true)
on conflict (slug) do update set
  title = excluded.title,
  -- Only overwrite content when the existing row is still the placeholder
  -- draft — so re-running the migration never clobbers real legal copy.
  content_md = case when policy_pages.is_draft and policy_pages.content_md like '%DRAFT%'
                   then excluded.content_md else policy_pages.content_md end;
