-- Rollback for 0099_drop_raelynn_community_default.sql
--
-- Puts the 'raelynn' default back on the twelve tables and removes the
-- triggers and the function. Run one statement at a time. It does not change
-- any row. Fan Engage Supabase project: uhovonrljcauaoctypbg

alter table public.artist_events alter column community_id set default 'raelynn';
alter table public.campaigns alter column community_id set default 'raelynn';
alter table public.community_posts alter column community_id set default 'raelynn';
alter table public.fan_actions alter column community_id set default 'raelynn';
alter table public.event_rsvps alter column community_id set default 'raelynn';
alter table public.event_reminders alter column community_id set default 'raelynn';
alter table public.fan_action_completions alter column community_id set default 'raelynn';
alter table public.purchases alter column community_id set default 'raelynn';
alter table public.fan_badges alter column community_id set default 'raelynn';
alter table public.points_ledger alter column community_id set default 'raelynn';
alter table public.referrals alter column community_id set default 'raelynn';
alter table public.offers alter column community_id set default 'raelynn';

drop trigger if exists artist_events_set_community_id on public.artist_events;
drop trigger if exists campaigns_set_community_id on public.campaigns;
drop trigger if exists community_posts_set_community_id on public.community_posts;
drop trigger if exists fan_actions_set_community_id on public.fan_actions;
drop trigger if exists event_rsvps_set_community_id on public.event_rsvps;
drop trigger if exists event_reminders_set_community_id on public.event_reminders;
drop trigger if exists fan_action_completions_set_community_id on public.fan_action_completions;
drop trigger if exists purchases_set_community_id on public.purchases;

drop function if exists public.set_community_id_from_parent();
