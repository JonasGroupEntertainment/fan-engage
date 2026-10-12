-- Mailchimp case 15164101807. Privacy policy only (policy_pages.slug =
-- 'privacy'). Terms are not touched.
--
-- 0069 already stored: "We do not sell, rent, or share mobile phone
-- numbers or SMS opt-in data and consent with third parties or
-- affiliates for their marketing or promotional purposes."
-- Mailchimp still requires this exact phrase on the public page:
-- "mobile opt-in data will not be shared with third parties."
--
-- Live /privacy reads policy_pages through applyPrivacySmsDisclosure,
-- which appends that sentence at render time. This statement updates
-- the stored row so /admin/policies matches the public page.
-- Idempotent: a second run does not duplicate the sentence.
--
-- Apply by hand in the Supabase SQL editor (one statement). Not run
-- by Vercel. Fan Engage Supabase project: uhovonrljcauaoctypbg

update public.policy_pages
set content_md = replace(
  content_md,
  'We do not sell, rent, or share mobile phone numbers or SMS opt-in data and consent with third parties or affiliates for their marketing or promotional purposes.',
  'We do not sell, rent, or share mobile phone numbers or SMS opt-in data and consent with third parties or affiliates for their marketing or promotional purposes. We confirm that mobile opt-in data will not be shared with third parties.'
)
where slug = 'privacy'
  and position(
    'mobile opt-in data will not be shared with third parties.'
    in content_md
  ) = 0
  and position(
    'We do not sell, rent, or share mobile phone numbers or SMS opt-in data and consent with third parties or affiliates for their marketing or promotional purposes.'
    in content_md
  ) > 0;
