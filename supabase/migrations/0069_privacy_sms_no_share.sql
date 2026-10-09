-- Not yet applied to production.
--
-- 0069_privacy_sms_no_share.sql
--
-- Privacy policy only (policy_pages.slug = 'privacy'). Terms are not
-- touched. Joins the wrapped bullet that the public page cuts off after
-- "text", and adds the SMS no-share sentence Mailchimp asked for.
--
-- Live /privacy reads policy_pages through a repo fallback
-- (applyPrivacySmsDisclosure) that makes the same edit at render time.
-- This statement is what changes the stored row. Until it is applied, or
-- Raymond or Kevin edits the page in /admin/policies, the database text
-- stays as it is. Idempotent: a second run does not duplicate the sentence.
--
-- If pasting into the Supabase SQL editor, run the statement once.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg

update public.policy_pages
set content_md = regexp_replace(
  content_md,
  'To provide you with communications when you sign up for our text\s+messages;',
  E'To provide you with communications when you sign up for our text messages;\n\nWe do not sell, rent, or share mobile phone numbers or SMS opt-in data and consent with third parties or affiliates for their marketing or promotional purposes.',
  'g'
)
where slug = 'privacy'
  and position(
    'We do not sell, rent, or share mobile phone numbers or SMS opt-in data and consent with third parties or affiliates for their marketing or promotional purposes.'
    in content_md
  ) = 0
  and content_md ~ 'To provide you with communications when you sign up for our text';
