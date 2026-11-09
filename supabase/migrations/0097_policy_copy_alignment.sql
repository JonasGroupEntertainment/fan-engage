-- Align public policy_pages copy with the cancellation-refund rule,
-- the 18+ terms age line, and support@fanengagepro.com.
--
-- Founding Fans keep their badge and 1.5× points as long as the account
-- stays active. That sentence is already section 3 of /cancellation-refund
-- (0072 and frontend/lib/legal/cancellation-refund-founding-status.ts).
-- Live /terms and /rewards-terms still say Founding Fan status is forfeited.
-- Those forfeiture sentences are in policy_pages only. They are not in a
-- merged migration. This draft keeps the badge. Kevin confirms before apply.
--
-- /privacy "CHILDREN UNDER THE AGE OF 13" is rewritten to the same 18+
-- requirement /terms already publishes. Signup behavior is not changed.
--
-- Public contact: raymond@jonasgroup.com and the retired public inboxes
-- become support@fanengagepro.com. carla@jonasgroup.com and
-- bhamilton@joneskeller.com are not in the replace list.
-- raymond@jonasgroup.com stays the staff super-admin in 0044. This file
-- only edits policy_pages.content_md.
--
-- No new tables. No grants.
-- Idempotent: each update matches the old phrase, so a second run changes
-- nothing.
-- Apply by hand in the Supabase SQL editor, one statement at a time.
-- Not applied by the draft PR. Not run by Vercel.
-- Numbered 0097 because 0096_lock_gated_posts.sql is the open gated-posts PR.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg

-- Statement 1 — public inboxes on every policy row.
do $$
declare
  emails text[] := array[
    'raymond@jonasgroup.com',
    'contact@fanengagepro.com',
    'contact@fep.com',
    'support@fanengage.app',
    'privacy@fanengage.app',
    'legal@fanengage.app'
  ];
  addr text;
  escaped text;
begin
  foreach addr in array emails loop
    escaped := regexp_replace(addr, '\.', '\\.', 'g');
    update public.policy_pages
    set content_md = regexp_replace(
      regexp_replace(
        content_md,
        '\[' || escaped || '\]\(mailto:' || escaped || '\)',
        '[support@fanengagepro.com](mailto:support@fanengagepro.com)',
        'gi'
      ),
      '(?<!\[)(?<!mailto:)' || escaped,
      '[support@fanengagepro.com](mailto:support@fanengagepro.com)',
      'gi'
    )
    where content_md ilike '%' || addr || '%';
  end loop;
end
$$;

-- Statement 2 — /terms forfeiture sentence, and the 0009 13+ placeholder.
update public.policy_pages
set content_md = regexp_replace(
  replace(
    content_md,
    'You must be 13 years or older to use Fan Engage.',
    'You must be 18 years or older to use Fan Engage.'
  ),
  $pat$If you terminate or cancel your subscription\s+you will lose any Fan Engage Pro Rewards Program rewards points,\s+and if you were a Founding Fan,\s+your Founding Fan status will be forfeited\.$pat$,
  $rep$Cancelling a Premium subscription does not forfeit Founding Fan status. Founding Fan status is a free badge offered to the first 100 fans who join an artist's community. It is not a paid plan and does not change the price of Premium. Founding Fans keep their badge and 1.5× points as long as their account stays active. Closing the account ends Founding Fan status. Premium is a separate optional subscription billed at the rate shown at checkout.$rep$,
  'g'
)
where slug = 'terms'
  and (
    content_md like '%your Founding Fan status will be forfeited%'
    or content_md like '%You must be 13 years or older to use Fan Engage.%'
  );

-- Statement 3 — /privacy children-under-13 section becomes 18+.
update public.policy_pages
set content_md = regexp_replace(
  content_md,
  $pat$(?:#{1,3}\s+)?CHILDREN UNDER THE AGE OF 13\s+Our Website is not intended for children under 13 years of age\.[\s\S]*?''Contact Us'' section below\)\.$pat$,
  $rep$AGE REQUIREMENT

The Services are intended for people 18 and older. You may not use this Website or register unless you are 18 or older. We do not knowingly collect Personal Information from anyone under 18. If you are under 18, do not use or provide any information on this Website, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address, or any screen name or user name you may use. If we learn we have collected or received Personal Information from someone under 18, we will delete that information. If you believe we might have any information from or about someone under 18, please contact us (please see the ''Contact Us'' section below).$rep$,
  'g'
)
where slug = 'privacy'
  and content_md like '%CHILDREN UNDER THE AGE OF 13%';

-- Statement 4 — /rewards-terms paid Founding Fan slot and lapse forfeiture.
update public.policy_pages
set content_md = regexp_replace(
  content_md,
  $pat$Founding Fan Tier\. Founding Fan is a limited, one-time-only membership designation[\s\S]*?Premium subscription lapses\.$pat$,
  $rep$Founding Fan Tier. Founding Fan status is a free badge offered to the first 100 fans who join an artist's community. It is not a paid plan and does not change the price of Premium. Founding Fans keep their badge and 1.5× points as long as their account stays active. Cancelling Premium does not forfeit Founding Fan status. Closing the account ends Founding Fan status. Premium is a separate optional subscription billed at the rate shown at checkout.$rep$,
  'g'
)
where slug = 'rewards_terms'
  and content_md like '%Founding Fan status is forfeited if the Founding Fan%';
