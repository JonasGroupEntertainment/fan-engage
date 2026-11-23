-- Review only. Do not run this from the pull request.
-- Policy text lives in policy_pages. This does not create a table.
-- It writes the same sentences the public pages already show through
-- frontend/lib/legal/align-policy-copy.ts. Help is not a policy row.
-- Rollback is docs/reviews/age-rule-13-rollback.sql.
-- If pasting into the SQL editor, run one statement at a time.

-- Entity name, if a stored row still says FEP, Inc.
update public.policy_pages
set content_md = replace(replace(content_md, 'FEP, Inc.', 'Fan Engage Pro LLC'), 'FEP Inc.', 'Fan Engage Pro LLC')
where slug in ('privacy', 'terms')
  and (content_md like '%FEP, Inc.%' or content_md like '%FEP Inc.%');

-- Terms account-age sentences. Text enrollment ("under 18 years old") stays.
update public.policy_pages
set content_md = replace(
  replace(
    replace(
      replace(
        content_md,
        'IF YOU ARE UNDER AGE 18, YOU MAY NOT USE THIS SITE.',
        'IF YOU ARE UNDER AGE 13, YOU MAY NOT USE THIS SITE.'
      ),
      'The Services are intended for people 18 and older. You may not register as a User unless you are 18 or older.',
      'Fans must be 13 or older. A fan who is 13, 14, 15, 16, or 17 may join only with a parent or guardian''s permission. No one under 13 may use Fan Engage Pro or give us information.'
    ),
    'We will terminate with or without notice any User who we believe is under the age of 18.',
    'We will terminate with or without notice any User who we believe is under the age of 13.'
  ),
  'You are 18 years old or older.',
  'You meet the age rule in AGE REQUIREMENT. If you are 13 to 17, a parent or guardian has said you may join.'
)
where slug = 'terms'
  and (
    content_md like '%UNDER AGE 18%'
    or content_md like '%people 18 and older%'
    or content_md like '%You are 18 years old or older.%'
  );

-- Privacy 18+ block to the same join rule, plus the under-13 paragraph.
update public.policy_pages
set content_md = replace(
  content_md,
  'The Services are intended for people 18 and older. You may not use this Website or register unless you are 18 or older. We do not knowingly collect Personal Information from anyone under 18. If you are under 18, do not use or provide any information on this Website, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address, or any screen name or user name you may use. If we learn we have collected or received Personal Information from someone under 18, we will delete that information. If you believe we might have any information from or about someone under 18, please contact us (please see the ''Contact Us'' section below).',
  'Fans must be 13 or older. A fan who is 13 to 17 may join only with a parent or guardian''s permission. No one under 13 may use this Website or give us information. Our Website is not intended for children under 13 years of age. No one under age 13 may provide any information to or on the Website. We do not knowingly collect Personal Information from children under 13. If you are under 13, do not use or provide any information on this Website or on or through any of its features, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address, or any screen name or user name you may use. If we learn we have collected or received Personal Information from a child under 13, we will delete that information. If you believe we might have any information from or about a child under 13, please contact us (please see the ''Contact Us'' section below).'
)
where slug = 'privacy'
  and content_md like '%The Services are intended for people 18 and older. You may not use this Website or register unless you are 18 or older.%';
