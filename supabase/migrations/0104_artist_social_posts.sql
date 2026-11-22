-- 0104_artist_social_posts.sql
--
-- Not yet applied to production.
--
-- Lets an artist's team also send a team announcement to the artist's own
-- Facebook Page and Instagram, through Blotato, with a sign-up link, so
-- new fans can find the community. Ported from Brand Engage Pro (its
-- migration 0118). Two tables:
--
--   artist_social_accounts  which Blotato accounts belong to which artist
--   artist_social_posts     one row per platform per announcement (the
--                           audit trail, and what the daily limit is
--                           counted from). Rows are written as 'pending'
--                           before anything is sent, then updated to
--                           'sent' or 'failed'. A row left 'pending' still
--                           counts toward the limit. submit_key is one
--                           fresh uuid per form submit, so a retry of the
--                           same submit never sends twice.
--
-- No rows are added here and no artist is switched on. Once an artist has
-- linked their accounts in Blotato, rows are added by hand, for example:
--
--   insert into public.artist_social_accounts (artist_slug, platform, blotato_account_id, page_id)
--   values ('<artist slug>', 'facebook', '<blotato account id>', '<facebook page id>');
--
--   insert into public.artist_social_accounts (artist_slug, platform, blotato_account_id, page_id)
--   values ('<artist slug>', 'instagram', '<blotato account id>', null);
--
-- The app also needs BLOTATO_API_KEY set and SOCIAL_POSTING_ENABLED set
-- to 1. Until the tables exist, or with either setting missing, the app
-- treats every artist as having no accounts linked and behaves as before.
--
-- Only team announcements are ever sent. Fan posts, comments, polls and
-- challenge entries have no sender. Premium and Founders announcements
-- are refused, and so are announcements that mention alcohol or tobacco
-- (fans can be 13 to 17). See frontend/lib/social/ and
-- frontend/lib/data/social-accounts.ts.
--
-- Platform and status are text with a check, not enums, so a new value
-- never has to be added and used in the same migration.
--
-- Service role only: row level security is on with no policies, and anon
-- and authenticated have no grants. Safely re-runnable. In the Supabase
-- SQL editor, run one statement at a time.

create table if not exists public.artist_social_accounts (
  id                  bigint generated always as identity primary key,
  artist_slug         text not null references public.artists(slug) on delete cascade,
  platform            text not null check (platform in ('facebook', 'instagram')),
  blotato_account_id  text not null,
  page_id             text,
  active              bool not null default true,
  created_at          timestamptz not null default now(),
  unique (artist_slug, platform)
);

alter table public.artist_social_accounts enable row level security;
revoke all on public.artist_social_accounts from anon, authenticated;
grant all on public.artist_social_accounts to service_role;

create table if not exists public.artist_social_posts (
  id                 bigint generated always as identity primary key,
  artist_slug        text not null references public.artists(slug) on delete cascade,
  community_post_id  uuid references public.community_posts(id) on delete set null,
  platform           text not null check (platform in ('facebook', 'instagram')),
  status             text not null check (status in ('pending', 'sent', 'skipped', 'failed')),
  provider_ref       text,
  detail             text,
  created_by         uuid,
  submit_key         text,
  created_at         timestamptz not null default now(),
  unique (community_post_id, platform)
);

-- One send per platform for each form submit, even if a retry saved a
-- second copy of the announcement under a new id.
create unique index if not exists artist_social_posts_submit_key_idx
  on public.artist_social_posts (artist_slug, submit_key, platform)
  where submit_key is not null;

create index if not exists artist_social_posts_artist_created_idx
  on public.artist_social_posts (artist_slug, created_at desc);

alter table public.artist_social_posts enable row level security;
revoke all on public.artist_social_posts from anon, authenticated;
grant all on public.artist_social_posts to service_role;
