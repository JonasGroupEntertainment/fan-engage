-- 0084_embedding_source_community_fkeys.sql
--
-- Apply manually. NOT applied.
-- Do not run this against production from an agent.
-- Apply by hand in the Supabase SQL editor, one statement at a time,
-- in order, and only after the orphan posts in the PR description are
-- reviewed. Fan Engage project: uhovonrljcauaoctypbg.
--
-- content_embeddings.community_id already references communities(slug)
-- (migration 0024). The worker copies community_posts.artist_slug and
-- artist_events.artist_slug into that column. Neither source column
-- references communities, so posts can name a fan community that does
-- not exist. The embeddings cron then hits
-- content_embeddings_community_id_fkey on every run.
--
-- These foreign keys stop new rows of that shape. ON DELETE RESTRICT
-- also stops deleting a community out from under posts or events.
--
-- This file fails while any artist_slug is missing from communities.
-- Run the orphan SELECT in the PR first. It does not delete those rows.
-- No new table, so no extra Data API grants.

-- 1
alter table public.community_posts
  drop constraint if exists community_posts_artist_slug_community_fkey;

-- 2
alter table public.community_posts
  add constraint community_posts_artist_slug_community_fkey
  foreign key (artist_slug)
  references public.communities(slug)
  on delete restrict;

-- 3
alter table public.artist_events
  drop constraint if exists artist_events_artist_slug_community_fkey;

-- 4
alter table public.artist_events
  add constraint artist_events_artist_slug_community_fkey
  foreign key (artist_slug)
  references public.communities(slug)
  on delete restrict;

-- 5
comment on constraint community_posts_artist_slug_community_fkey
  on public.community_posts is
  'Embedding tenant. content_embeddings.community_id stores this slug. NOT applied until orphan artist_slug values are cleaned up by hand.';

-- 6
comment on constraint artist_events_artist_slug_community_fkey
  on public.artist_events is
  'Embedding tenant, in addition to artist_events_artist_slug_fkey → artists. NOT applied until this file is run by hand.';
