-- 0091_presave_and_ai_gates.sql
--
-- Sprint 3 (2026-10-29 audit) item C. Idempotent. Apply one statement at a
-- time in the SQL editor (it silently drops statements from multi-statement
-- scripts).
--
-- Three things:
--
--   1. Pre-save loop — REUSES public.fan_actions (0005) with kind = 'pre_save'
--      instead of a new presave_campaigns table. fan_actions already models
--      exactly this: artist_slug, title, url (Spotify / Apple / linkfire),
--      point_value, active, ends_at, sort_order, plus one-per-fan completion
--      rows in fan_action_completions (PK fan_id, action_id). The campaign
--      builder (/admin/campaigns/new) already creates 'pre_save' rows. Gaps
--      closed here: a release_date column, anon read of active rows so the
--      public artist page can show the card, and the award trigger handing
--      pre_save awards to the app so they land in the ledger as
--      source = 'presave' (0048 / 20260803195847) with
--      source_ref = 'presave:<action id>:<fan id>' (lib/presave/core.ts).
--
--   2. ai_feature_gates — DB-backed override for AI feature rollout so
--      AI_DRAFTER_FREE_COMMUNITIES no longer needs a Vercel redeploy.
--      Resolution order lives in lib/ai-gates/core.ts: row > env > off.
--
--   3. community_posts founder-only RLS. Until now 'founder-only' was enforced
--      in app code only: 0002's community_posts_select (authenticated → true)
--      was never dropped and 0025's community_posts_public_read is role-less,
--      so any signed-in fan (and anon through PostgREST) could select the
--      body of a founder-only post. Both policies are replaced with one that
--      keeps every existing read EXCEPT founder-only rows for non-founders
--      (authors + community admins keep their own policies from 0025). The
--      feed still shows a locked teaser for those rows — the page fetches
--      id/title/created_at stubs with the service role (app/artists/[slug]/
--      community/page.tsx), never the body.

-- ─── 1a. fan_actions.release_date ─────────────────────────────────────────
alter table public.fan_actions
  add column if not exists release_date date;

comment on column public.fan_actions.release_date is
  'Pre-save: the release date. The card stays live while release_date is in the future or within 7 days past (lib/presave/core.ts isPresaveLive). Null = no date gating.';

create index if not exists fan_actions_artist_kind_active_idx
  on public.fan_actions (artist_slug, kind, active);

-- ─── 1b. Anon can read active CTAs (artist page is public) ────────────────
-- 0005's fan_actions_public_read requires auth.role() = 'authenticated'.
-- Adding a second select policy ORs with it, so this only widens reads for
-- anon and only to active pre_save rows (the artist page's pre-save card).
-- Completions stay fan-scoped.
drop policy if exists fan_actions_anon_read_active on public.fan_actions;
create policy fan_actions_anon_read_active on public.fan_actions
  for select to anon using (active = true and kind = 'pre_save');

-- ─── 1c. award_fan_action_points: hand pre_save awards to the app ─────────
-- Same body as 0053 with one early return: kind = 'pre_save' is awarded by
-- lib/presave/actions.ts → awardPoints(source 'presave',
-- ref 'presave:<action>:<fan>') so the ledger source is honest (not
-- 'social_share'). The app checks the completion row's points_awarded and
-- skips its own award when a pre-0091 trigger already paid, so the two
-- versions of this function never double-award.
create or replace function public.award_fan_action_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base int;
  v_slug text;
  v_kind fan_action_kind;
  v_ref  text;
begin
  select point_value, artist_slug, kind into v_base, v_slug, v_kind
    from fan_actions where id = new.action_id;
  if v_base is null or v_base <= 0 then return new; end if;

  -- Pre-saves: awarded by the app (lib/presave/actions.ts) as source 'presave'.
  if v_kind = 'pre_save' then
    new.points_awarded := 0;
    return new;
  end if;

  v_ref := 'fan_action:' || new.action_id::text || ':' || new.fan_id::text;
  if exists (select 1 from points_ledger where source_ref = v_ref) then
    return new;
  end if;

  if v_kind = 'share' then
    perform public.try_award_share_points(new.fan_id, v_slug, v_ref);
    new.points_awarded := coalesce(
      (select delta from points_ledger where source_ref = v_ref),
      0
    );
    return new;
  end if;

  new.points_awarded := public.apply_points_award(
    new.fan_id, v_base, 'social_share', v_ref, v_slug, 'CTA completed'
  );
  return new;
end $$;

-- ─── 2. ai_feature_gates ───────────────────────────────────────────────────
create table if not exists public.ai_feature_gates (
  feature       text not null,
  community_id  text not null references public.communities(slug) on delete cascade,
  enabled       boolean not null default false,
  updated_by    uuid references public.fans(id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (feature, community_id)
);

comment on table public.ai_feature_gates is
  'Per-community override for AI features (ai_comment_drafter, …). A row wins over the AI_DRAFTER_FREE_COMMUNITIES env fallback; no row = env; nothing = off. Edited at /admin/ai-gates (super-admin).';

alter table public.ai_feature_gates enable row level security;

-- Super-admins (admin_users.community_id = '*') read and write; service_role
-- bypasses RLS. Nobody else, including community admins, can see the table.
drop policy if exists ai_feature_gates_super_admin_select on public.ai_feature_gates;
create policy ai_feature_gates_super_admin_select on public.ai_feature_gates
  for select to authenticated using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.community_id = '*'
    )
  );

drop policy if exists ai_feature_gates_super_admin_write on public.ai_feature_gates;
create policy ai_feature_gates_super_admin_write on public.ai_feature_gates
  for all to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.community_id = '*'
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.community_id = '*'
    )
  );

revoke all on table public.ai_feature_gates from anon;
grant select, insert, update, delete on table public.ai_feature_gates to authenticated;
grant all on table public.ai_feature_gates to service_role;

-- ─── 3. community_posts: founder-only enforced at the DB ──────────────────
-- Replaces 0002 community_posts_select (authenticated → everything, never
-- dropped) and 0025 community_posts_public_read (moderation filter only).
-- Select policies OR together, so both must go for the restriction to bite.
-- community_posts_author_read and community_posts_admin_read (0025) stay, so
-- authors and community admins keep seeing their own / their community's rows.
drop policy if exists community_posts_select on public.community_posts;

drop policy if exists community_posts_public_read on public.community_posts;
create policy community_posts_public_read on public.community_posts
  for select using (
    moderation_status in ('pending', 'safe', 'flag_review')
    and (
      visibility is distinct from 'founder-only'
      or (auth.uid() is not null and public.is_founder(auth.uid(), artist_slug))
    )
  );

-- ─── Smoke tests (commented) ──────────────────────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'fan_actions' and column_name = 'release_date';
-- select policyname from pg_policies where tablename = 'community_posts';
-- select * from public.ai_feature_gates;
