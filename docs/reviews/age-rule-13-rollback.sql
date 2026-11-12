-- Rollback for docs/reviews/age-rule-13.sql. Do not run from the draft PR.
-- Restores the 18+ sentences that file replaces. Does not restore an
-- unknown earlier "FEP, Inc." sentence, because the forward script does
-- not record the previous entity wording.

update public.policy_pages
set content_md = replace(
  replace(
    replace(
      replace(
        content_md,
        'IF YOU ARE UNDER AGE 13, YOU MAY NOT USE THIS SITE.',
        'IF YOU ARE UNDER AGE 18, YOU MAY NOT USE THIS SITE.'
      ),
      'The Services are intended for people 13 and older. You may not register as a User unless you are 13 or older. If you are 13 to 17, a parent or guardian must say you can join.',
      'The Services are intended for people 18 and older. You may not register as a User unless you are 18 or older.'
    ),
    'We will terminate with or without notice any User who we believe is under the age of 13.',
    'We will terminate with or without notice any User who we believe is under the age of 18.'
  ),
  'You are 13 years old or older. If you are under 18, a parent or guardian has said you can join.',
  'You are 18 years old or older.'
)
where slug = 'terms'
  and content_md like '%UNDER AGE 13%';

update public.policy_pages
set content_md = replace(
  content_md,
  'Fans must be 13 or older. No one under 13 may use this Website or give us personal information. Fans ages 13 to 17 may join only with a parent or guardian''s OK. We do not knowingly keep personal information from anyone under 13. If we learn we have, we will delete it. If you believe we might have information from someone under 13, please contact us (please see the ''Contact Us'' section below).',
  'The Services are intended for people 18 and older. You may not use this Website or register unless you are 18 or older. We do not knowingly collect Personal Information from anyone under 18. If you are under 18, do not use or provide any information on this Website, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address, or any screen name or user name you may use. If we learn we have collected or received Personal Information from someone under 18, we will delete that information. If you believe we might have any information from or about someone under 18, please contact us (please see the ''Contact Us'' section below).'
)
where slug = 'privacy'
  and content_md like '%Fans ages 13 to 17 may join only with a parent or guardian''s OK.%';
