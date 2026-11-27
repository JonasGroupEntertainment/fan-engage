-- 0112_one_waiting_redemption_per_reward.sql
--
-- Applied to production on 2026-11-27 (ledger version 20261127175012), before
-- this file was pushed.
--
-- A fan can have one waiting (pending) redemption of a reward at a time.
-- The app already checks this before it redeems
-- (frontend/lib/data/rewards.ts); this makes the database hold the rule
-- too, so two presses at the same moment cannot both go through. Same
-- purpose as Brand Engage Pro 0126, done with an index so redeem_reward
-- itself is not rewritten.
--
-- How it works: redeem_reward inserts the pending redemption and then
-- spends the points in one transaction. A second pending row for the same
-- fan and reward is refused by this index, which undoes that whole
-- transaction, so no points are spent. Once the first redemption is
-- fulfilled or cancelled, the reward can be redeemed again.
--
-- On 2026-11-27 production had no fan with two pending redemptions of the
-- same reward (and no pending redemptions at all), so the index builds.
-- Safely re-runnable. Rollback: drop index
-- public.reward_redemptions_one_pending_per_reward.

create unique index if not exists reward_redemptions_one_pending_per_reward
  on public.reward_redemptions (fan_id, reward_id)
  where status = 'pending';
