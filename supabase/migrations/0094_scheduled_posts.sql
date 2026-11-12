-- 0094_scheduled_posts.sql
--
-- Sprint 4 (2026-10-29 audit) item A — scheduled community posts from the
-- artist-portal composer. Idempotent. Apply one statement at a time in the
-- SQL editor (it silently drops statements from multi-statement scripts).
--
-- Two columns on community_posts:
--
--   scheduled_for  timestamptz  null = published now (every existing row).
--                               A future value hides the row from the
--                               public read policy until that moment; the
--                               composer sets created_at to the same value
--                               so the feed orders it as "new" when it
--                               appears (lib/community/post-input.ts).
--   announced_at   timestamptz  stamped by /api/cron/publish-scheduled-posts
--                               (every 5 min) when it fires notifyNewPost
--                               for a scheduled post that has come due.
--                               Immediately-published posts are notified
--                               at creation and never get this stamp —
--                               the cron only selects rows where
--                               scheduled_for is not null.
--
-- The public read policy is 0091's body plus one clause. The author_read
-- and admin_read policies from 0025 are untouched, so the team still sees
-- its own scheduled rows (the portal lists them in a "Scheduled" section
-- with Publish-now / Unschedule). Service-role reads that serve fans
-- (fan home, search, personal feed, founder stubs) filter in app code —
-- see lib/data/scheduled-posts.ts.

-- ─── 1. Columns ────────────────────────────────────────────────────────────
alter table public.community_posts
  add column if not exists scheduled_for timestamptz;

alter table public.community_posts
  add column if not exists announced_at timestamptz;

comment on column public.community_posts.scheduled_for is
  'Null = published immediately. A future timestamp hides the post from community_posts_public_read until then; /api/cron/publish-scheduled-posts announces it once due.';

comment on column public.community_posts.announced_at is
  'When /api/cron/publish-scheduled-posts fired notifyNewPost for this scheduled post. Null for immediately-published posts (notified at creation) and for scheduled posts not yet due.';

-- Partial: only scheduled rows, which is what the cron and the portal scan.
create index if not exists community_posts_scheduled_for_idx
  on public.community_posts (scheduled_for)
  where scheduled_for is not null;

-- ─── 2. Public read policy: 0091 body + scheduled gate ─────────────────────
-- Same expression as 0091_presave_and_ai_gates.sql §3, with the trailing
-- `and (scheduled_for is null or scheduled_for <= now())`.
drop policy if exists community_posts_public_read on public.community_posts;
create policy community_posts_public_read on public.community_posts
  for select using (
    moderation_status in ('pending', 'safe', 'flag_review')
    and (
      visibility is distinct from 'founder-only'
      or (auth.uid() is not null and public.is_founder(auth.uid(), artist_slug))
    )
    and (scheduled_for is null or scheduled_for <= now())
  );

-- ─── Smoke tests (commented) ──────────────────────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'community_posts' and column_name in ('scheduled_for', 'announced_at');
-- select indexname from pg_indexes where tablename = 'community_posts' and indexname = 'community_posts_scheduled_for_idx';
-- select policyname, qual from pg_policies where tablename = 'community_posts' and policyname = 'community_posts_public_read';
