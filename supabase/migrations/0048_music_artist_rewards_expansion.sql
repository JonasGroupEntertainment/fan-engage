-- ============================================================================
-- 0048_music_artist_rewards_expansion.sql — broaden the rewards catalog for
-- music artists: presale/access perks, ticket-adjacent perks, and richer
-- digital content. Also opens the earn side for pre-save and radio-support
-- actions, which are NOT redemption items — see the note below.
-- Safe to re-run (idempotent).
-- ============================================================================

-- ─── Earn-side: new point_source values ────────────────────────────────────
-- Pre-save campaigns and radio-support actions award points to fans; they are
-- not things fans redeem points FOR, so they don't belong in rewards_catalog.
-- This only adds the enum values. Wiring an actual award path (client report,
-- webhook, or admin-triggered) is a separate follow-up — same shape as the
-- trigger functions in 0045_membership_points_sync.sql
-- (award_event_rsvp_points, etc.), because pre-save/radio actions happen on
-- external platforms and can't be observed by a DB trigger the way an insert
-- into community_posts or artist_events can.
do $$ begin
  alter type point_source add value if not exists 'presave';
exception when others then null; end $$;

do $$ begin
  alter type point_source add value if not exists 'radio_support';
exception when others then null; end $$;

-- Ticket-purchase earn already fits the existing 'purchase' point_source —
-- no new enum value needed there.

-- ─── Redemption-side: extend rewards_catalog.kind ──────────────────────────
-- Existing kinds (0021): merch_discount, voice_note, video_shoutout,
-- early_access, custom, experience. Adding two to close real gaps:
--   ticket_perk  — seating/parking/queue-position perks tied to an event
--   merch_item   — a physical item itself (signed poster/vinyl), distinct
--                  from merch_discount which is a % off code
alter table public.rewards_catalog drop constraint if exists rewards_catalog_kind_check;
alter table public.rewards_catalog add constraint rewards_catalog_kind_check
  check (kind in (
    'merch_discount', 'voice_note', 'video_shoutout', 'early_access',
    'custom', 'experience', 'ticket_perk', 'merch_item'
  ));

-- ─── Seed global redemption catalog (community_id null = every artist) ─────
-- requires_tier maps to the subscription gate only (premium / founder-only),
-- not the points-based tier ladder in `tiers`. Point costs are the ask, not
-- the subscription gate — a fan can hit 8,000 points on the free tier and
-- still be blocked from a founder-only reward, by design (mirrors how
-- requires_tier already works for existing rows).
insert into public.rewards_catalog
  (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier)
select null, title, description, point_cost, kind, stock, true, sort_order, requires_tier
from (
  values
    -- Access & Presale
    ('Presale Password Unlock', 'Get the presale code before it goes public.', 300, 'early_access', null, 10, null),
    ('Early Access Presale Window', '24-48 hour early access to ticket presale.', 500, 'early_access', null, 11, null),
    ('Front-of-Line Queue Position', 'Priority queue position for GA ticket sales.', 1500, 'early_access', 200, 12, null),
    ('VIP Ticket Upgrade', 'Upgrade a GA ticket to VIP tier.', 3500, 'ticket_perk', 50, 13, 'premium'),
    ('Soundcheck Access', 'Watch soundcheck before the show.', 6000, 'experience', 20, 14, 'premium'),
    ('Meet & Greet Pass', 'Meet the artist before or after the show.', 8000, 'experience', 10, 15, 'founder-only'),
    ('Backstage Tour', 'Full backstage walkthrough on show day.', 10000, 'experience', 5, 16, 'founder-only'),

    -- Ticket-Adjacent Perks
    ('Merch Bundle with Ticket', 'Bundled merch item when purchasing a ticket.', 2000, 'ticket_perk', 100, 20, null),
    ('Priority Seating Upgrade', 'Upgrade to a priority-seating section.', 2500, 'ticket_perk', 50, 21, 'premium'),
    ('Parking / Rideshare Credit', 'Parking pass or rideshare credit for show night.', 1200, 'ticket_perk', null, 22, null),

    -- Digital & Enhanced Content
    ('Behind-the-Scenes Video', 'Unlock an exclusive behind-the-scenes clip.', 400, 'custom', null, 30, null),
    ('Unreleased Demo Unlock', 'Access an unreleased demo or voice memo.', 750, 'custom', null, 31, null),
    ('Digital Autograph', 'Unlock a digital autograph / signed art print.', 600, 'custom', null, 32, null),
    ('Exclusive Acoustic Session Stream', 'Stream an exclusive acoustic or live session.', 1500, 'experience', null, 33, 'premium'),
    ('Signed Physical Merch', 'A signed poster or vinyl, shipped to the fan.', 4000, 'merch_item', 25, 34, 'premium'),
    ('Personalized Shoutout Video', 'A personalized video message from the artist.', 5000, 'video_shoutout', 10, 35, 'founder-only'),

    -- Community & Recognition
    ('Fan Spotlight', 'Get featured on the artist''s social/app feed.', 1000, 'custom', null, 40, null),
    ('Birthday Shoutout', 'A batched birthday shoutout from the artist.', 3000, 'video_shoutout', null, 41, 'premium')
) as r(title, description, point_cost, kind, stock, sort_order, requires_tier)
where not exists (
  select 1 from public.rewards_catalog
  where community_id is null and title = r.title
);
