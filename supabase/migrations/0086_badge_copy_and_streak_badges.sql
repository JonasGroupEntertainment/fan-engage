-- 0086_badge_copy_and_streak_badges.sql
--
-- 1. Tier badge copy. The 0004 seed rows still describe the pre-0046 ladder
--    (Silver 2,500 / Gold 10,000 / Platinum 25,000). The live ladder since
--    0046 is 750 / 3,500 / 8,000 (lib/tier-thresholds.ts). The app rewrites
--    the copy at read time (lib/data/badges.ts publicBadgeDescription) but
--    share pages and anything reading `badges` raw still showed the old
--    numbers. Fix the rows.
--
-- 2. Streak badges. lib/streaks/touch.ts upserts fan_badges rows with
--    badge_slug = streak-7 / streak-30 / streak-100 / streak-365 when a fan
--    hits a daily-streak milestone. Those badges exist in the production
--    database but no migration in this repo creates them, so a fresh DB (or
--    a branch) fails the fan_badges -> badges FK on the first milestone.
--    Seed them here. point_value is 0: the milestone bonus (50 / 200 / 1,000
--    / 5,000 — MILESTONES in touch.ts) is already paid through the ledger by
--    awardPoints, and touch.ts writes fan_badges directly rather than via
--    award_badge, so a non-zero point_value here would never be paid and
--    would only mislead the badge gallery.
--
-- Idempotent: safe to re-run. `on conflict (slug) do nothing` leaves any
-- hand-edited production copy for the streak badges alone.

-- ─── 1. Tier badge descriptions on the 0046 ladder ────────────────────────
update public.badges
   set description = 'Crossed into Silver — 750 pts.'
 where slug = 'tier-silver'
   and description is distinct from 'Crossed into Silver — 750 pts.';

update public.badges
   set description = 'Reached Gold — 3,500 pts. Serious fan energy.'
 where slug = 'tier-gold'
   and description is distinct from 'Reached Gold — 3,500 pts. Serious fan energy.';

update public.badges
   set description = 'Platinum unlocked — 8,000 pts. Elite status.'
 where slug = 'tier-platinum'
   and description is distinct from 'Platinum unlocked — 8,000 pts. Elite status.';

-- ─── 2. Streak milestone badges (slugs must match lib/streaks/touch.ts) ───
insert into public.badges (slug, name, description, icon, point_value, category, threshold, sort_order)
values
  ('streak-7',   'One-week streak',   'Checked in 7 days in a row.',                     '🔥',  0, 'community',   7, 20),
  ('streak-30',  'One-month streak',  'Checked in 30 days in a row.',                    '🌙',  0, 'community',  30, 21),
  ('streak-100', 'Century streak',    'Checked in 100 days in a row. Relentless.',       '💯',  0, 'community', 100, 22),
  ('streak-365', 'One-year streak',   'Checked in every day for a full year.',           '🏅',  0, 'community', 365, 23)
on conflict (slug) do nothing;

-- ─── Verify (SQL editor) ───────────────────────────────────────────────────
-- select slug, description from public.badges where slug like 'tier-%';
-- select slug, name from public.badges where slug like 'streak-%';
-- -- Expected: 4 streak rows
