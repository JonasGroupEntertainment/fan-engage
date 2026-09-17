-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — Terms of Use entity / governing-law / venue facts
--
-- Fan Engage Pro LLC is a Colorado LLC (CO reg #20261702886), not a
-- North Carolina LLC. Rewrite only those three published phrases on
-- policy_pages.slug = 'terms'. All other Terms language is unchanged.
--
-- Do not touch privacy (counsel-draft / not this PR).
-- Do not touch rewards_terms (separate document; out of this scope).
-- Notices address, if present, stays Belmont, NC — that is a mail address,
-- not the entity state. Live Terms currently have no street address.
--
-- Idempotent. No-op after the three phrases are already Colorado.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg
-- ────────────────────────────────────────────────────────────────────────────

update public.policy_pages
set content_md = replace(
  replace(
    replace(
      content_md,
      'a North Carolina limited liability company',
      'a Colorado limited liability company'
    ),
    'laws of the State of North Carolina',
    'laws of the State of Colorado'
  ),
  'The place of the arbitration and each in person hearing shall be North Carolina.',
  'The place of the arbitration and each in person hearing shall be Colorado.'
)
where slug = 'terms';
