-- 0099_drop_raelynn_community_default.sql
--
-- DRAFT. NOT applied. Do not run this from an agent or from the draft PR.
-- Kevin applies it by hand in the Supabase SQL editor, one numbered
-- statement at a time, in order, AFTER the code in this PR is deployed.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg
--
-- Why
-- ---
-- Thirteen tables give community_id a default of 'raelynn', left over from
-- when RaeLynn was the only community. An insert that leaves the column out
-- is filed under RaeLynn with no error. On 2026-11-11 that had mis-filed 39
-- of 61 community posts, 4 Hunter Hawkins events and 8 reminders, all
-- corrected by hand the same day.
--
-- What this does
-- --------------
-- For twelve of the thirteen tables it drops the default.
--
-- Most app code does not set community_id (25 of 34 inserts on 2026-11-11),
-- so dropping the default alone would break those writes. For the eight
-- tables where the right community can be read from the row itself, a
-- BEFORE INSERT trigger fills it in when it is missing:
--
--   artist_events, campaigns, community_posts, fan_actions  <- artist_slug
--   event_rsvps, event_reminders                            <- the event
--   fan_action_completions                                  <- the action
--   purchases                                               <- the offer
--
-- If the trigger cannot work it out, the insert fails with a NOT NULL
-- error. A missing community becomes a visible error, never a silent
-- 'raelynn'.
--
-- fan_badges, points_ledger, referrals and offers get no trigger: there is
-- nothing in the row to derive from. Every known writer sets the column
-- (offers: the campaign builder is fixed in this same PR).
--
-- NOT touched: notifications. Three writers leave community_id out
-- (lib/data/notifications.ts, lib/event-matching/send.ts and the SQL
-- function upsert_notification) and a notification has no parent row to
-- derive from. Migration 0100 changes those writers and drops that default.
--
-- No new table, so no Data API grants. No existing row is changed.
-- Idempotent: every statement can be run twice.
-- Rollback: supabase/rollbacks/0099_drop_raelynn_community_default_rollback.sql

-- 1. The trigger function. SECURITY DEFINER so the lookup of the parent row
--    is not blocked by row level security on the caller (a fan RSVPing can
--    insert into event_rsvps but the lookup must not depend on what that
--    fan may read).
create or replace function public.set_community_id_from_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.community_id is not null then
    return new;
  end if;

  case tg_argv[0]
    when 'artist_slug' then
      new.community_id := new.artist_slug;
    when 'event' then
      select e.community_id into new.community_id
        from public.artist_events e where e.id = new.event_id;
    when 'action' then
      select a.community_id into new.community_id
        from public.fan_actions a where a.id = new.action_id;
    when 'offer' then
      select o.community_id into new.community_id
        from public.offers o where o.id = new.offer_id;
    else
      raise exception 'set_community_id_from_parent: unknown source %', tg_argv[0];
  end case;

  if new.community_id is null then
    raise exception 'community_id is required on %', tg_table_name
      using errcode = '23502';
  end if;
  return new;
end;
$$;

-- 2. New definer functions start closed (0062). Triggers do not need the
--    caller to hold EXECUTE.
revoke all on function public.set_community_id_from_parent() from public, anon, authenticated;

-- 3. artist_events
drop trigger if exists artist_events_set_community_id on public.artist_events;
create trigger artist_events_set_community_id
  before insert on public.artist_events
  for each row execute function public.set_community_id_from_parent('artist_slug');
alter table public.artist_events alter column community_id drop default;

-- 4. campaigns
drop trigger if exists campaigns_set_community_id on public.campaigns;
create trigger campaigns_set_community_id
  before insert on public.campaigns
  for each row execute function public.set_community_id_from_parent('artist_slug');
alter table public.campaigns alter column community_id drop default;

-- 5. community_posts
drop trigger if exists community_posts_set_community_id on public.community_posts;
create trigger community_posts_set_community_id
  before insert on public.community_posts
  for each row execute function public.set_community_id_from_parent('artist_slug');
alter table public.community_posts alter column community_id drop default;

-- 6. fan_actions
drop trigger if exists fan_actions_set_community_id on public.fan_actions;
create trigger fan_actions_set_community_id
  before insert on public.fan_actions
  for each row execute function public.set_community_id_from_parent('artist_slug');
alter table public.fan_actions alter column community_id drop default;

-- 7. event_rsvps
drop trigger if exists event_rsvps_set_community_id on public.event_rsvps;
create trigger event_rsvps_set_community_id
  before insert on public.event_rsvps
  for each row execute function public.set_community_id_from_parent('event');
alter table public.event_rsvps alter column community_id drop default;

-- 8. event_reminders
drop trigger if exists event_reminders_set_community_id on public.event_reminders;
create trigger event_reminders_set_community_id
  before insert on public.event_reminders
  for each row execute function public.set_community_id_from_parent('event');
alter table public.event_reminders alter column community_id drop default;

-- 9. fan_action_completions
drop trigger if exists fan_action_completions_set_community_id on public.fan_action_completions;
create trigger fan_action_completions_set_community_id
  before insert on public.fan_action_completions
  for each row execute function public.set_community_id_from_parent('action');
alter table public.fan_action_completions alter column community_id drop default;

-- 10. purchases
drop trigger if exists purchases_set_community_id on public.purchases;
create trigger purchases_set_community_id
  before insert on public.purchases
  for each row execute function public.set_community_id_from_parent('offer');
alter table public.purchases alter column community_id drop default;

-- 11. No trigger: every writer already sets community_id.
alter table public.fan_badges alter column community_id drop default;
alter table public.points_ledger alter column community_id drop default;
alter table public.referrals alter column community_id drop default;

-- 12. offers. Only after the campaign builder fix in this PR is live.
alter table public.offers alter column community_id drop default;

-- ─── Verify (SQL editor) ───────────────────────────────────────────────────
-- select table_name from information_schema.columns
--  where table_schema = 'public' and column_default like '%raelynn%';
-- -- Expected: notifications only.
