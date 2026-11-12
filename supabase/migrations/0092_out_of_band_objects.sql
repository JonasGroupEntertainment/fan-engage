-- Fan Engage: 0092 — bring the out-of-band production objects into the repo.
--
-- PROVENANCE
--   Seven tables and three RPCs exist in production (uhovonrljcauaoctypbg) with
--   no migration that creates them. They were applied straight through the
--   Supabase SQL editor / MCP during the notifications, streaks, AI post-drafter,
--   audience-segments and digest work. The live DDL (columns, constraints,
--   indexes, RLS policies, grants) was pulled from prod on 2026-10-29 and is
--   recorded in `.scratch/out-of-band-ddl.md`; this file reproduces it
--   statement by statement.
--
--   Every statement is idempotent: on prod it is a no-op, on a fresh database
--   it creates the objects. Nothing here drops a table or touches data.
--
-- WHY THESE OBJECTS MATTER (code paths that read/write them)
--   push_subscriptions           lib/notifications/push.ts,
--                                app/me/notifications/page.tsx,
--                                app/api/push/subscribe/route.ts,
--                                app/api/push/unsubscribe/route.ts
--   notification_preferences     lib/notifications/preferences.ts,
--                                lib/notifications/types.ts, lib/sms-send-gate.ts,
--                                app/me/notifications/{actions,prefs,page}.tsx,
--                                app/account/birth-date/actions.ts,
--                                app/api/fan-engage/onboard/route.ts,
--                                app/api/push/{subscribe,unsubscribe}/route.ts
--   notification_log             lib/notifications/send.ts
--   streak_log                   lib/streaks/touch.ts
--   reward_drop_notifications    app/api/cron/drops-notifier/route.ts
--   artist_post_drafts           app/admin/post-drafts/{actions,page}.tsx,
--                                app/api/cron/post-drafts/route.ts
--   audience_segments            app/admin/segments/{actions,page}.tsx
--   evaluate_audience_segment    lib/segments/evaluate.ts (admin client)
--   find_threads_needing_summary lib/thread-summary/backfill.ts (admin client)
--   list_digest_recipients_at_hour
--                                app/api/cron/weekly-digest/route.ts,
--                                app/api/cron/compute-optimal-hours/route.ts
--
-- DEPENDENCIES — verified against earlier migrations
--   fans(id)                    0001_init.sql
--   community_posts(id)         0002_community.sql   (author_id, artist_slug ok)
--   community_comments          0002_community.sql
--   rewards_catalog(id)         0021_rewards_redemption.sql
--   admin_users(user_id, community_id)
--                               0011_multi_tenant.sql
--   is_admin_of(text)           0011_multi_tenant.sql
--   tier_slug enum              0001_init.sql
--   fans.interest / sms_opted_in / email_opted_in
--                               0001_init.sql
--   list_digest_recipients(int) 0027_digest.sql (security definer, service_role)
--   auth.users(id)              Supabase-managed; always present.
--
-- DEPENDENCIES — NOT defined by any migration (also out-of-band in prod)
--   fans.optimal_notification_hour         written by app/api/cron/compute-optimal-hours,
--                                          read by list_digest_recipients_at_hour
--   community_posts.thread_summary,
--   community_posts.thread_summary_count,
--   community_posts.thread_summary_at      written by lib/thread-summary/backfill.ts,
--                                          read by find_threads_needing_summary
--                                          and lib/data/community.ts
--   compute_optimal_notification_hours(p_min_events int, p_lookback_days int)
--                                          RPC called by the compute-optimal-hours
--                                          cron. Body pulled from prod 2026-10-29;
--                                          reproduced in section 11 below.
--   Section 8 below adds the four columns with `add column if not exists`
--   (types inferred from the app: lib/data/types.ts declares thread_summary
--   string|null and thread_summary_count number|null; p_hour is smallint).
--   On prod that is a no-op. The two RPCs that read these columns are created
--   inside a guard that checks the columns exist, so the file can never fail
--   on a database where section 8 was skipped.
--
-- KNOWN FRESH-BOOT ORDERING ISSUE (not fixable from this file)
--   0062_lock_down_security_definer_functions.sql line 53 runs
--   `revoke execute on function public.list_digest_recipients_at_hour(...)`
--   unguarded. On a database built from migrations alone, that statement fails
--   because the function is first created here, in 0092. Prod is unaffected
--   (0062 was applied against a database where the function already existed).
--   A fresh boot needs 0062's two unguarded lines wrapped in an
--   `if exists (select 1 from pg_proc ...)` guard, or 0092 applied before 0062.
--
-- CONSTRAINT NAMES
--   The DDL pull shows the constraints unnamed (Postgres defaults). The guards
--   below use the default names Postgres assigns (`<table>_pkey`,
--   `<table>_<col>_key`, `<table>_<col>_fkey`, `<table>_<col>_check`). If prod
--   ever used a different name, the guard would add a second, identical
--   constraint — harmless, but worth knowing.
--
-- VERIFY (run after applying; expected counts in comments)
--   select count(*) from pg_tables where schemaname='public' and tablename in
--     ('push_subscriptions','notification_preferences','notification_log',
--      'streak_log','reward_drop_notifications','artist_post_drafts',
--      'audience_segments');                                      -- 7
--   select count(*) from pg_policies where schemaname='public' and tablename in
--     ('push_subscriptions','notification_preferences','notification_log',
--      'streak_log','reward_drop_notifications','artist_post_drafts',
--      'audience_segments');                                      -- 15
--   select count(*) from pg_policies where policyname like 'notification_prefs_%';  -- 0
--   select count(*) from pg_proc where proname in ('evaluate_audience_segment',
--     'find_threads_needing_summary','list_digest_recipients_at_hour');            -- 3
--   select has_function_privilege('anon',
--     'public.evaluate_audience_segment(jsonb,text,integer)','execute');          -- false
--   select has_function_privilege('anon',
--     'public.list_digest_recipients_at_hour(smallint,integer)','execute');       -- false

-- ─── 1. push_subscriptions ─────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id            uuid not null default gen_random_uuid(),
  fan_id        uuid not null,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  constraint push_subscriptions_pkey primary key (id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_endpoint_key' and conrelid = 'public.push_subscriptions'::regclass) then
    alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key unique (endpoint);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_fan_id_fkey' and conrelid = 'public.push_subscriptions'::regclass) then
    alter table public.push_subscriptions add constraint push_subscriptions_fan_id_fkey foreign key (fan_id) references public.fans(id) on delete cascade;
  end if;
end $$;

create index if not exists push_subscriptions_fan_idx on public.push_subscriptions (fan_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_self_read on public.push_subscriptions;
create policy push_subscriptions_self_read on public.push_subscriptions
  for select to authenticated using (fan_id = auth.uid());

drop policy if exists push_subscriptions_self_insert on public.push_subscriptions;
create policy push_subscriptions_self_insert on public.push_subscriptions
  for insert to authenticated with check (fan_id = auth.uid());

drop policy if exists push_subscriptions_self_delete on public.push_subscriptions;
create policy push_subscriptions_self_delete on public.push_subscriptions
  for delete to authenticated using (fan_id = auth.uid());

grant all on public.push_subscriptions to anon, authenticated, service_role;

-- ─── 2. notification_preferences ───────────────────────────────────────────

create table if not exists public.notification_preferences (
  fan_id                     uuid not null,
  push_enabled               boolean not null default false,
  sms_enabled                boolean not null default false,
  notify_new_post            boolean not null default true,
  notify_event_match         boolean not null default true,
  notify_comment_on_my_post  boolean not null default true,
  notify_redemption          boolean not null default true,
  notify_drops               boolean not null default true,
  notify_rsvp_confirmation   boolean not null default true,
  quiet_start                time,
  quiet_end                  time,
  timezone                   text not null default 'America/Chicago',
  updated_at                 timestamptz not null default now(),
  notify_predictions         boolean not null default true,
  notify_anniversaries       boolean not null default true,
  notify_leaderboard         boolean not null default true,
  notify_weekly_digest       boolean not null default true,
  -- 0089 adds this on prod; included here so a fresh boot gets it without
  -- ordering constraints (0089 is `add column if not exists`, so both orders work).
  notify_streak              boolean not null default true,
  constraint notification_preferences_pkey primary key (fan_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_preferences_fan_id_fkey' and conrelid = 'public.notification_preferences'::regclass) then
    alter table public.notification_preferences add constraint notification_preferences_fan_id_fkey foreign key (fan_id) references public.fans(id) on delete cascade;
  end if;
end $$;

alter table public.notification_preferences enable row level security;

-- Two generations of policies coexist in prod. Keep the `notif_prefs_*` set
-- (scoped to `authenticated`), drop the older `notification_prefs_*` pair
-- (scoped to `public`).
drop policy if exists notification_prefs_self_read on public.notification_preferences;
drop policy if exists notification_prefs_self_upsert on public.notification_preferences;

drop policy if exists notif_prefs_self_read on public.notification_preferences;
create policy notif_prefs_self_read on public.notification_preferences
  for select to authenticated using (fan_id = auth.uid());

drop policy if exists notif_prefs_self_update on public.notification_preferences;
create policy notif_prefs_self_update on public.notification_preferences
  for update to authenticated using (fan_id = auth.uid());

drop policy if exists notif_prefs_self_upsert on public.notification_preferences;
create policy notif_prefs_self_upsert on public.notification_preferences
  for insert to authenticated with check (fan_id = auth.uid());

grant all on public.notification_preferences to anon, authenticated, service_role;

-- ─── 3. notification_log ───────────────────────────────────────────────────

create table if not exists public.notification_log (
  id                  uuid not null default gen_random_uuid(),
  fan_id              uuid not null,
  channel             text not null,
  notification_type   text not null,
  title               text,
  body                text,
  url                 text,
  status              text not null default 'sent',
  suppression_reason  text,
  error               text,
  metadata            jsonb not null default '{}',
  sent_at             timestamptz not null default now(),
  constraint notification_log_pkey primary key (id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_log_fan_id_fkey' and conrelid = 'public.notification_log'::regclass) then
    alter table public.notification_log add constraint notification_log_fan_id_fkey foreign key (fan_id) references public.fans(id) on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_log_channel_check' and conrelid = 'public.notification_log'::regclass) then
    alter table public.notification_log add constraint notification_log_channel_check check (channel in ('push','sms','email','in_app'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_log_status_check' and conrelid = 'public.notification_log'::regclass) then
    alter table public.notification_log add constraint notification_log_status_check check (status in ('sent','failed','suppressed','queued'));
  end if;
end $$;

create index if not exists notification_log_fan_idx on public.notification_log (fan_id, sent_at desc);
create index if not exists notification_log_type_idx on public.notification_log (notification_type, sent_at desc);

alter table public.notification_log enable row level security;

drop policy if exists notif_log_self_read on public.notification_log;
create policy notif_log_self_read on public.notification_log
  for select to authenticated using (fan_id = auth.uid());

drop policy if exists notif_log_super_admin_read on public.notification_log;
create policy notif_log_super_admin_read on public.notification_log
  for select to authenticated using (
    exists (select 1 from public.admin_users where admin_users.user_id = auth.uid() and admin_users.community_id = '*')
  );

grant all on public.notification_log to anon, authenticated, service_role;

-- ─── 4. streak_log ─────────────────────────────────────────────────────────

create table if not exists public.streak_log (
  id              uuid not null default gen_random_uuid(),
  fan_id          uuid not null,
  event_type      text not null,
  streak_days     integer not null,
  points_awarded  integer not null default 0,
  milestone_days  integer,
  occurred_at     timestamptz not null default now(),
  metadata        jsonb not null default '{}',
  constraint streak_log_pkey primary key (id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'streak_log_fan_id_fkey' and conrelid = 'public.streak_log'::regclass) then
    alter table public.streak_log add constraint streak_log_fan_id_fkey foreign key (fan_id) references public.fans(id) on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'streak_log_event_type_check' and conrelid = 'public.streak_log'::regclass) then
    alter table public.streak_log add constraint streak_log_event_type_check check (event_type in ('increment','reset','milestone','first_visit','no_op'));
  end if;
end $$;

create index if not exists streak_log_fan_idx on public.streak_log (fan_id, occurred_at desc);

alter table public.streak_log enable row level security;

drop policy if exists streak_log_self_read on public.streak_log;
create policy streak_log_self_read on public.streak_log
  for select to authenticated using (fan_id = auth.uid());

drop policy if exists streak_log_super_admin_read on public.streak_log;
create policy streak_log_super_admin_read on public.streak_log
  for select to authenticated using (
    exists (select 1 from public.admin_users where user_id = auth.uid() and community_id = '*')
  );

grant all on public.streak_log to anon, authenticated, service_role;

-- ─── 5. reward_drop_notifications ──────────────────────────────────────────

create table if not exists public.reward_drop_notifications (
  id         uuid not null default gen_random_uuid(),
  reward_id  uuid not null,
  kind       text not null,
  fired_at   timestamptz not null default now(),
  metadata   jsonb not null default '{}',
  constraint reward_drop_notifications_pkey primary key (id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reward_drop_notifications_reward_id_kind_key' and conrelid = 'public.reward_drop_notifications'::regclass) then
    alter table public.reward_drop_notifications add constraint reward_drop_notifications_reward_id_kind_key unique (reward_id, kind);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reward_drop_notifications_reward_id_fkey' and conrelid = 'public.reward_drop_notifications'::regclass) then
    alter table public.reward_drop_notifications add constraint reward_drop_notifications_reward_id_fkey foreign key (reward_id) references public.rewards_catalog(id) on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reward_drop_notifications_kind_check' and conrelid = 'public.reward_drop_notifications'::regclass) then
    alter table public.reward_drop_notifications add constraint reward_drop_notifications_kind_check check (kind in ('launched','expiring'));
  end if;
end $$;

create index if not exists reward_drop_notifications_kind_idx on public.reward_drop_notifications (kind, fired_at desc);

alter table public.reward_drop_notifications enable row level security;

drop policy if exists reward_drop_notif_super_admin_all on public.reward_drop_notifications;
create policy reward_drop_notif_super_admin_all on public.reward_drop_notifications
  for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid() and community_id = '*'))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid() and community_id = '*'));

grant all on public.reward_drop_notifications to anon, authenticated, service_role;

-- ─── 6. artist_post_drafts ─────────────────────────────────────────────────

create table if not exists public.artist_post_drafts (
  id                 uuid not null default gen_random_uuid(),
  artist_slug        text not null,
  kind               text not null default 'post',
  suggested_title    text,
  suggested_body     text not null,
  context_summary    text,
  inputs_json        jsonb not null default '{}',
  status             text not null default 'pending',
  generated_by       text not null default 'ai',
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  published_post_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint artist_post_drafts_pkey primary key (id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'artist_post_drafts_published_post_id_fkey' and conrelid = 'public.artist_post_drafts'::regclass) then
    alter table public.artist_post_drafts add constraint artist_post_drafts_published_post_id_fkey foreign key (published_post_id) references public.community_posts(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'artist_post_drafts_reviewed_by_fkey' and conrelid = 'public.artist_post_drafts'::regclass) then
    alter table public.artist_post_drafts add constraint artist_post_drafts_reviewed_by_fkey foreign key (reviewed_by) references auth.users(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'artist_post_drafts_kind_check' and conrelid = 'public.artist_post_drafts'::regclass) then
    alter table public.artist_post_drafts add constraint artist_post_drafts_kind_check check (kind in ('post','announcement'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'artist_post_drafts_status_check' and conrelid = 'public.artist_post_drafts'::regclass) then
    alter table public.artist_post_drafts add constraint artist_post_drafts_status_check check (status in ('pending','published','discarded'));
  end if;
end $$;

create index if not exists artist_post_drafts_artist_idx on public.artist_post_drafts (artist_slug, status, created_at desc);

alter table public.artist_post_drafts enable row level security;

drop policy if exists artist_post_drafts_admin_read on public.artist_post_drafts;
create policy artist_post_drafts_admin_read on public.artist_post_drafts
  for select to authenticated using (public.is_admin_of(artist_slug));

drop policy if exists artist_post_drafts_admin_write on public.artist_post_drafts;
create policy artist_post_drafts_admin_write on public.artist_post_drafts
  for all to authenticated
  using (public.is_admin_of(artist_slug))
  with check (public.is_admin_of(artist_slug));

grant all on public.artist_post_drafts to anon, authenticated, service_role;

-- ─── 7. audience_segments ──────────────────────────────────────────────────
-- fan_ids is uuid[] (the DDL pull printed it as ARRAY).

create table if not exists public.audience_segments (
  id                 uuid not null default gen_random_uuid(),
  artist_slug        text not null,
  name               text not null,
  description_input  text,
  filter_json        jsonb not null default '{}',
  member_count       integer not null default 0,
  fan_ids            uuid[] not null default '{}',
  created_by         uuid,
  created_at         timestamptz not null default now(),
  refreshed_at       timestamptz not null default now(),
  constraint audience_segments_pkey primary key (id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'audience_segments_created_by_fkey' and conrelid = 'public.audience_segments'::regclass) then
    alter table public.audience_segments add constraint audience_segments_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists audience_segments_artist_idx on public.audience_segments (artist_slug, created_at desc);

alter table public.audience_segments enable row level security;

drop policy if exists audience_segments_admin_read on public.audience_segments;
create policy audience_segments_admin_read on public.audience_segments
  for select to authenticated using (public.is_admin_of(artist_slug));

drop policy if exists audience_segments_admin_write on public.audience_segments;
create policy audience_segments_admin_write on public.audience_segments
  for all to authenticated
  using (public.is_admin_of(artist_slug))
  with check (public.is_admin_of(artist_slug));

grant all on public.audience_segments to anon, authenticated, service_role;

-- ─── 8. Out-of-band columns the RPCs below depend on ──────────────────────
-- No-ops on prod. Types inferred from the app (see header).

alter table public.fans
  add column if not exists optimal_notification_hour smallint;

alter table public.community_posts
  add column if not exists thread_summary text;

alter table public.community_posts
  add column if not exists thread_summary_count integer;

alter table public.community_posts
  add column if not exists thread_summary_at timestamptz;

-- ─── 9. RPC evaluate_audience_segment ──────────────────────────────────────
-- SECURITY DEFINER; service_role only (lib/segments/evaluate.ts uses the
-- admin client). Matches the 0062 lock-down.

create or replace function public.evaluate_audience_segment(
  p_filter      jsonb,
  p_artist_slug text,
  p_limit       integer default 1000
)
returns table (
  fan_id        uuid,
  email         text,
  first_name    text,
  city          text,
  current_tier  tier_slug,
  total_points  integer,
  posts_30d     bigint
)
language plpgsql stable security definer
as $function$
DECLARE
  v_tiers tier_slug[]; v_points_min integer; v_points_max integer; v_city_contains text; v_interest_contains text;
  v_sms_opted_in boolean; v_email_opted_in boolean; v_signup_within_days integer; v_signup_older_than_days integer; v_min_posts_last_30d integer;
BEGIN
  IF p_filter ? 'tiers' AND jsonb_typeof(p_filter->'tiers') = 'array' THEN
    SELECT ARRAY(SELECT t::tier_slug FROM jsonb_array_elements_text(p_filter->'tiers') AS t WHERE t IN ('bronze','silver','gold','platinum')) INTO v_tiers;
  END IF;
  v_points_min := NULLIF(p_filter->>'total_points_min','')::integer;
  v_points_max := NULLIF(p_filter->>'total_points_max','')::integer;
  v_city_contains := NULLIF(p_filter->>'city_contains','');
  v_interest_contains := NULLIF(p_filter->>'interest_contains','');
  v_sms_opted_in := NULLIF(p_filter->>'sms_opted_in','')::boolean;
  v_email_opted_in := NULLIF(p_filter->>'email_opted_in','')::boolean;
  v_signup_within_days := NULLIF(p_filter->>'signup_within_days','')::integer;
  v_signup_older_than_days := NULLIF(p_filter->>'signup_older_than_days','')::integer;
  v_min_posts_last_30d := NULLIF(p_filter->>'min_posts_last_30d','')::integer;
  RETURN QUERY
  WITH posts_per_fan AS (
    SELECT cp.author_id, COUNT(*)::bigint AS n FROM public.community_posts cp
    WHERE cp.artist_slug = p_artist_slug AND cp.created_at > now() - interval '30 days' GROUP BY cp.author_id)
  SELECT f.id::uuid, f.email::text, f.first_name::text, f.city::text, f.current_tier, f.total_points::integer, COALESCE(pp.n,0)::bigint
  FROM public.fans f LEFT JOIN posts_per_fan pp ON pp.author_id = f.id
  WHERE (v_tiers IS NULL OR cardinality(v_tiers) = 0 OR f.current_tier = ANY(v_tiers))
    AND (v_points_min IS NULL OR f.total_points >= v_points_min)
    AND (v_points_max IS NULL OR f.total_points <= v_points_max)
    AND (v_city_contains IS NULL OR f.city ILIKE '%' || v_city_contains || '%')
    AND (v_interest_contains IS NULL OR COALESCE(f.interest,'') ILIKE '%' || v_interest_contains || '%')
    AND (v_sms_opted_in IS NULL OR f.sms_opted_in = v_sms_opted_in)
    AND (v_email_opted_in IS NULL OR f.email_opted_in = v_email_opted_in)
    AND (v_signup_within_days IS NULL OR f.created_at >= now() - (v_signup_within_days || ' days')::interval)
    AND (v_signup_older_than_days IS NULL OR f.created_at <= now() - (v_signup_older_than_days || ' days')::interval)
    AND (v_min_posts_last_30d IS NULL OR COALESCE(pp.n,0) >= v_min_posts_last_30d)
  ORDER BY COALESCE(pp.n,0) DESC, f.total_points DESC
  LIMIT GREATEST(p_limit,0);
END $function$;

revoke execute on function public.evaluate_audience_segment(jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.evaluate_audience_segment(jsonb, text, integer) to service_role;

-- ─── 10. RPC find_threads_needing_summary ──────────────────────────────────
-- SECURITY INVOKER, read-only counts. Grants kept as live (PUBLIC execute).
-- Guarded on community_posts.thread_summary_count existing (section 8 adds it).

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'community_posts' and column_name = 'thread_summary_count'
  ) then
    execute $fn$
      create or replace function public.find_threads_needing_summary(
        p_min_comments  integer default 8,
        p_refresh_delta integer default 5,
        p_limit         integer default 10
      )
      returns table (post_id uuid, comment_count bigint)
      language plpgsql stable
      as $function$
      BEGIN
        RETURN QUERY
        WITH counts AS (SELECT cc.post_id, COUNT(*)::bigint AS n FROM community_comments cc GROUP BY cc.post_id)
        SELECT cp.id AS post_id, c.n AS comment_count FROM community_posts cp JOIN counts c ON c.post_id = cp.id
        WHERE c.n >= p_min_comments AND (cp.thread_summary IS NULL OR cp.thread_summary_count IS NULL OR cp.thread_summary_count < (c.n - p_refresh_delta))
        ORDER BY c.n DESC LIMIT p_limit;
      END $function$;
    $fn$;
    execute 'grant execute on function public.find_threads_needing_summary(integer, integer, integer) to public, anon, authenticated, service_role';
  else
    raise warning '0092: community_posts.thread_summary_count missing; find_threads_needing_summary not created';
  end if;
end $$;

-- ─── 11. RPC list_digest_recipients_at_hour ────────────────────────────────
-- SECURITY INVOKER wrapper over list_digest_recipients(int) (0027, definer);
-- service_role only. Guarded on fans.optimal_notification_hour and on the
-- wrapped function existing.

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fans' and column_name = 'optimal_notification_hour'
  ) and exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_digest_recipients'
  ) then
    execute $fn$
      create or replace function public.list_digest_recipients_at_hour(
        p_hour  smallint,
        p_limit integer default 500
      )
      returns table (fan_id uuid, email text, first_name text, total_points integer, current_tier text)
      language plpgsql stable
      as $function$
      BEGIN
        RETURN QUERY
        SELECT r.fan_id, r.email, r.first_name, r.total_points, r.current_tier
        FROM list_digest_recipients(p_limit * 4) r JOIN fans f ON f.id = r.fan_id
        WHERE f.optimal_notification_hour = p_hour OR (f.optimal_notification_hour IS NULL AND p_hour = 9)
        ORDER BY r.fan_id LIMIT p_limit;
      END $function$;
    $fn$;
    execute 'revoke execute on function public.list_digest_recipients_at_hour(smallint, integer) from public, anon, authenticated';
    execute 'grant execute on function public.list_digest_recipients_at_hour(smallint, integer) to service_role';
  else
    raise warning '0092: fans.optimal_notification_hour or list_digest_recipients(int) missing; list_digest_recipients_at_hour not created';
  end if;
end $$;

-- ─── 12. RPC compute_optimal_notification_hours (pulled 2026-10-29) ──────
-- Signature confirmed from pg_get_functiondef (see .scratch/out-of-band-ddl.md).
-- Called by app/api/cron/compute-optimal-hours. Live grants were the default
-- PUBLIC/anon/authenticated/service_role execute; it only aggregates post
-- timestamps, but nothing client-side calls it, so restrict to service_role.
create or replace function public.compute_optimal_notification_hours(
  p_min_events integer default 5, p_lookback_days integer default 90
)
returns table(fan_id uuid, optimal_hour smallint, event_count bigint)
language plpgsql
stable
as $$
begin
  return query
  with events as (
    select cp.author_id::uuid as fan_id,
           extract(hour from (cp.created_at at time zone 'UTC'))::smallint as h
      from community_posts cp
     where cp.created_at > now() - (p_lookback_days || ' days')::interval
       and cp.author_id is not null
  ),
  counts as (
    select e.fan_id, e.h, count(*)::bigint as n from events e group by e.fan_id, e.h
  ),
  totals as (
    select c.fan_id, sum(c.n)::bigint as total_n from counts c group by c.fan_id
  ),
  ranked as (
    select c.fan_id, c.h, c.n, t.total_n,
           row_number() over (partition by c.fan_id order by c.n desc, c.h asc) as rk
      from counts c join totals t on t.fan_id = c.fan_id
     where t.total_n >= p_min_events
  )
  select r.fan_id, r.h::smallint as optimal_hour, r.total_n as event_count
    from ranked r where r.rk = 1;
end $$;

revoke execute on function public.compute_optimal_notification_hours(integer, integer) from public, anon, authenticated;
grant execute on function public.compute_optimal_notification_hours(integer, integer) to service_role;
