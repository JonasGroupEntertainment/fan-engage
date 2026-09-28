-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — Privacy counsel scrub + official public contact
--
-- Counsel-approved Privacy cleanup (Sep 2026): drop nonprofit / donation /
-- volunteer / harm-reduction wording that does not belong to Fan Engage Pro,
-- and publish raymond@jonasgroup.com as the only public contact inbox.
--
-- Privacy body is rewritten in place. Terms, Cookie, Cancellation, and
-- Rewards Terms change contact emails only (plus the Terms customer-support
-- sentence, which named no address). DMCA agent bhamilton@joneskeller.com
-- and rewards ops carla@jonasgroup.com are left alone.
--
-- Idempotent. A matching read-time helper in frontend/lib/legal keeps
-- /privacy correct even before this migration is applied.
-- If pasting into the Supabase SQL editor, run one statement at a time.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg
-- ────────────────────────────────────────────────────────────────────────────

-- Statement 1 — retired public inboxes on non-privacy policies.
-- Cookie, cancellation, and rewards copy is otherwise unchanged.
update public.policy_pages
set content_md = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            content_md,
            'contact@fanengagepro\.com',
            '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
            'gi'
          ),
          'contact@fep\.com',
          '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
          'gi'
        ),
        'support@fanengagepro\.com',
        '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
        'gi'
      ),
      'support@fanengage\.app',
      '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
      'gi'
    ),
    'privacy@fanengage\.app',
    '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
    'gi'
  ),
  'legal@fanengage\.app',
  '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
  'gi'
)
where slug in ('terms', 'cookie_policy', 'cancellation_refund', 'rewards_terms');

-- Statement 2 — Terms support sentence only (no other Terms edits).
update public.policy_pages
set content_md = replace(
  content_md,
  'contacting FEP customer support team',
  'contacting FEP customer support at [raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)'
)
where slug = 'terms';

-- Statement 3 — Privacy nonprofit scrub, contact lock, last-updated date.
update public.policy_pages
set
  content_md = regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      replace(content_md, U&'\200B', ''),
                      'FEP processes your Personal Information to improve our Services, manage\s+accounts, fulfill requests, accept donations, accept volunteer\s+applications and manage volunteers, accept and process event\s+applications, further our mission, and promote harm reduction\.\s+We\s+process this information based on consent, contractual necessity, or\s+legitimate interests aligned with our vision\.',
                      'FEP processes your Personal Information to improve our Services, manage accounts, fulfill requests, and accept and process event applications. We process this information based on consent, contractual necessity, or legitimate interests.',
                      'g'
                    ),
                    'While the California Consumer Privacy Act \(CCPA\) primarily applies to\s+for-profit businesses, our privacy practices align with CCPA''s goals of\s+transparency and security where relevant',
                    'The California Consumer Privacy Act (CCPA) applies to Fan Engage Pro as a for-profit business. Where it applies, our privacy practices follow CCPA''s requirements for transparency and security',
                    'g'
                  ),
                  'To allow you to request services or volunteer for events;',
                  'To allow you to request services;',
                  'g'
                ),
                'purchase or donation',
                'purchase',
                'g'
              ),
              'aligned with our nonprofit mission',
              'in operating our fan-engagement services',
              'g'
            ),
            'This Policy was last updated on June 19, 2026\.',
            'This Policy was last updated on September 24, 2026.',
            'g'
          ),
          'contact@fanengagepro\.com',
          '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
          'gi'
        ),
        'contact@fep\.com',
        '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
        'gi'
      ),
      'support@fanengage\.app',
      '[raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
      'gi'
    ),
    'Fan Engage Pro Legal Team\s*Email:\s*$',
    E'Fan Engage Pro Legal Team\nEmail: [raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)',
    'i'
  ),
  effective_date = case
    when effective_date = date '2026-06-19' then date '2026-09-24'
    else effective_date
  end
where slug = 'privacy';
