-- 0083_list_unembedded_rows_skip_missing_communities.sql
--
-- Apply manually. NOT applied.
-- Do not run this against production from an agent.
-- Apply by hand in the Supabase SQL editor, one statement at a time,
-- in order. Fan Engage project: uhovonrljcauaoctypbg.
--
-- list_unembedded_rows() (migration 0024) returns community_posts and
-- artist_events keyed by artist_slug, and rewards keyed by community_id.
-- content_embeddings.community_id references communities(slug). artist_slug
-- on those source tables does not, so a missing community stays at the
-- front of every backfill page and the upsert fails the cron.
--
-- This keeps those rows out of the worker's page. The embeddings cron
-- still skips and logs them if they show up. No new table.

-- 1
create or replace function public.list_unembedded_rows(
  p_limit int default 100
) returns table (
  source_table text,
  source_id    uuid,
  community_id text
)
language sql
security definer
stable
as $$
  -- community_posts. The embedding tenant is artist_slug, not the
  -- community_id column (that column defaults to 'raelynn' and can
  -- disagree with the post's artist).
  select 'community_posts'::text, p.id, p.artist_slug
  from public.community_posts p
  join public.communities c on c.slug = p.artist_slug
  left join public.content_embeddings e
    on e.source_table = 'community_posts' and e.source_id = p.id
  where e.id is null
  union all

  -- community_comments inherit the parent post's artist_slug.
  select 'community_comments'::text, cm.id, p.artist_slug
  from public.community_comments cm
  join public.community_posts p on p.id = cm.post_id
  join public.communities c on c.slug = p.artist_slug
  left join public.content_embeddings e
    on e.source_table = 'community_comments' and e.source_id = cm.id
  where e.id is null
  union all

  -- communities (slug-keyed; deterministic uuid from md5())
  select 'communities'::text,
         (md5('community:' || c.slug))::uuid,
         c.slug
  from public.communities c
  left join public.content_embeddings e
    on e.source_table = 'communities' and e.source_id = (md5('community:' || c.slug))::uuid
  where e.id is null and c.active = true
  union all

  select 'artist_events'::text, ev.id, ev.artist_slug
  from public.artist_events ev
  join public.communities c on c.slug = ev.artist_slug
  left join public.content_embeddings e
    on e.source_table = 'artist_events' and e.source_id = ev.id
  where e.id is null and ev.active = true
  union all

  select 'rewards_catalog'::text, r.id, r.community_id
  from public.rewards_catalog r
  join public.communities c on c.slug = r.community_id
  left join public.content_embeddings e
    on e.source_table = 'rewards_catalog' and e.source_id = r.id
  where e.id is null and r.active = true and r.community_id is not null

  limit p_limit;
$$;

-- 2
comment on function public.list_unembedded_rows is
  'Rows from indexed source tables that have no content_embeddings entry and whose tenant slug exists in communities. Missing communities are omitted so they cannot fail or fill the embeddings backfill. NOT applied until this file is run by hand.';

-- 3
revoke all on function public.list_unembedded_rows(integer) from public, anon, authenticated;

-- 4
grant execute on function public.list_unembedded_rows(integer) to service_role;
