-- 0096_lock_gated_posts.sql
--
-- Premium and founder-only community posts were readable by anyone who
-- could SELECT the row. 0091/0094 only carve founder-only out of
-- community_posts_public_read. Premium stayed open, and the original
-- community_comments_select / poll / challenge policies still let every
-- signed-in fan read those child rows.
--
-- This migration:
--   * adds can_read_post_visibility(visibility, artist_slug) — the same
--     matrix as app canReadPostBody / canAccess:
--       public        everyone, including anon
--       premium       is_premium (premium, comped, past_due)
--       founder-only  is_founder
--     A Founding Fan who is not Premium does not inherit premium posts.
--     Premium does not inherit founder-only posts.
--   * rebuilds community_posts_public_read with that check, keeping
--     0094's scheduled_for gate and 0025's moderation filter.
--     community_posts_author_read and community_posts_admin_read stay,
--     so the author and admin_users staff (is_admin_of: owner, admin,
--     editor, viewer, and '*') keep the row.
--   * gates comments, poll options, poll votes, and challenge entries
--     (bodies and images) on the parent post. Comment authors still
--     read their own comments. Challenge entrants still read their own
--     entry. Admins still read via the existing admin policies.
--   * adds locked_community_post_stubs for the locked card. It returns
--     id, title, kind, pinned, created_at, visibility — never body,
--     image, or video.
--
-- can_read_post_visibility and the stub RPC are granted to anon and
-- authenticated because the public read policy and the signed-out
-- teaser call them. They do not take a fan id and do not return a body.
-- is_premium stays revoked from anon (0062); the wrapper is security
-- definer and calls it as the owner.
--
-- No new table. Idempotent. Apply one statement at a time in the SQL
-- editor (a multi-statement paste drops everything after the first).
-- Requires 0094 (scheduled_for) and 0015/0019 (is_premium, is_founder).
-- NOT applied to production by this change.

-- Statement 1
create or replace function public.can_read_post_visibility(
  p_visibility text,
  p_artist_slug text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_visibility is null or p_visibility = 'public' then true
    when auth.uid() is null then false
    when p_visibility = 'premium'
      then public.is_premium(auth.uid(), p_artist_slug)
    when p_visibility = 'founder-only'
      then public.is_founder(auth.uid(), p_artist_slug)
    else false
  end;
$$;

comment on function public.can_read_post_visibility(text, text) is
  'True when the current session may read a community post of this visibility in this community. Public is open. Premium uses is_premium (not is_founder). Founder-only uses is_founder. Does not cover the author or admin_users exceptions; those are separate policies.';

-- Statement 2
revoke all on function public.can_read_post_visibility(text, text) from public, anon, authenticated;

-- Statement 3
grant execute on function public.can_read_post_visibility(text, text) to anon, authenticated, service_role;

-- Statement 4 — 0094's public read, plus the premium gate.
drop policy if exists community_posts_public_read on public.community_posts;

-- Statement 5
create policy community_posts_public_read on public.community_posts
  for select using (
    moderation_status in ('pending', 'safe', 'flag_review')
    and public.can_read_post_visibility(visibility, artist_slug)
    and (scheduled_for is null or scheduled_for <= now())
  );

-- Statement 6 — child tables. Security definer so the lookup is not
-- blocked by RLS on community_posts (which would recurse if a policy
-- on that table called this). Author and is_admin_of match the select
-- policies that 0025 left in place.
create or replace function public.community_post_visible_to_viewer(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts p
    where p.id = p_post_id
      and (
        (auth.uid() is not null and p.author_id = auth.uid())
        or public.is_admin_of(p.artist_slug)
        or (
          p.moderation_status in ('pending', 'safe', 'flag_review')
          and (p.scheduled_for is null or p.scheduled_for <= now())
          and public.can_read_post_visibility(p.visibility, p.artist_slug)
        )
      )
  );
$$;

comment on function public.community_post_visible_to_viewer(uuid) is
  'True when the current session may read the parent community post (public tier, qualifying membership, author, or admin_users staff). Used by comment, poll, and challenge SELECT policies.';

-- Statement 7
revoke all on function public.community_post_visible_to_viewer(uuid) from public, anon, authenticated;

-- Statement 8
grant execute on function public.community_post_visible_to_viewer(uuid) to anon, authenticated, service_role;

-- Statement 9 — 0002 let every authenticated fan read every comment.
drop policy if exists community_comments_select on public.community_comments;

-- Statement 10
drop policy if exists community_comments_public_read on public.community_comments;

-- Statement 11
create policy community_comments_public_read on public.community_comments
  for select using (
    moderation_status in ('pending', 'safe', 'flag_review')
    and public.community_post_visible_to_viewer(post_id)
  );

-- Statement 12 — poll option labels are the post. 0003 let every
-- authenticated fan read every option.
drop policy if exists community_poll_options_select on public.community_poll_options;

-- Statement 13
create policy community_poll_options_select on public.community_poll_options
  for select to authenticated using (
    public.community_post_visible_to_viewer(post_id)
  );

-- Statement 14
drop policy if exists community_poll_votes_select on public.community_poll_votes;

-- Statement 15
create policy community_poll_votes_select on public.community_poll_votes
  for select to authenticated using (
    public.community_post_visible_to_viewer(post_id)
  );

-- Statement 16 — entry body and image_url. The entrant keeps their own
-- row; everyone else needs to be able to read the parent post.
drop policy if exists community_challenge_entries_select on public.community_challenge_entries;

-- Statement 17
create policy community_challenge_entries_select on public.community_challenge_entries
  for select to authenticated using (
    fan_id = auth.uid()
    or public.community_post_visible_to_viewer(post_id)
  );

-- Statement 18 — locked-card teaser. No body, image, or video column.
create or replace function public.locked_community_post_stubs(
  p_artist_slug text,
  p_tag text default null,
  p_limit integer default 10
) returns table (
  id uuid,
  title text,
  kind text,
  pinned boolean,
  created_at timestamptz,
  visibility text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.kind::text,
    p.pinned,
    p.created_at,
    p.visibility
  from public.community_posts p
  where p.artist_slug = p_artist_slug
    and p.visibility in ('premium', 'founder-only')
    and p.moderation_status in ('pending', 'safe', 'flag_review')
    and (p.scheduled_for is null or p.scheduled_for <= now())
    and not public.can_read_post_visibility(p.visibility, p.artist_slug)
    and (auth.uid() is null or p.author_id is distinct from auth.uid())
    and not public.is_admin_of(p.artist_slug)
    and (p_tag is null or p_tag = '' or p_tag = any(p.tags))
  order by p.pinned desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;

comment on function public.locked_community_post_stubs(text, text, integer) is
  'Title-only stubs of premium and founder-only posts the current session cannot read. Never returns body, image_url, or video_url.';

-- Statement 19
revoke all on function public.locked_community_post_stubs(text, text, integer) from public, anon, authenticated;

-- Statement 20
grant execute on function public.locked_community_post_stubs(text, text, integer) to anon, authenticated, service_role;

-- ─── Verify (SQL editor, one statement at a time) ─────────────────────────
-- select policyname from pg_policies
--  where tablename = 'community_posts' and policyname = 'community_posts_public_read';
-- select pg_get_functiondef('public.can_read_post_visibility(text,text)'::regprocedure);
-- -- premium branch calls is_premium, not is_founder.
-- select proname from pg_proc
--  where proname in (
--    'can_read_post_visibility',
--    'community_post_visible_to_viewer',
--    'locked_community_post_stubs'
--  );
-- select policyname from pg_policies
--  where tablename in (
--    'community_comments',
--    'community_poll_options',
--    'community_poll_votes',
--    'community_challenge_entries'
--  )
--  order by tablename, policyname;
-- -- community_comments_select, the old poll/challenge "authenticated reads all"
-- -- policies, must be gone.
