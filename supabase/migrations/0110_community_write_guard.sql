-- 0110_community_write_guard.sql
--
-- Not yet applied to production.
--
-- The rules for writing to the community are moved into the database, so
-- they hold for every writer. Port of Brand Engage Pro 0124, adapted to
-- this app (Premium posting, team authors who post with their own
-- session, and points that go through apply_points_award).
--
-- What this changes:
--
-- 1. Fans no longer update posts. The app never updates a post with a
--    fan session: pin, duplicate_of, moderation, tags, summaries,
--    scheduling and prediction results are all written with the service
--    role. Fans can still delete their own posts and comments.
--
-- 2. A BEFORE INSERT trigger on community_posts. For a signed-in session
--    (auth.role() 'authenticated' or 'anon') it accepts only what the
--    composer can produce:
--      * a plain, unpinned 'post';
--      * from a fan with Premium in that community (premium, comped or
--        past_due, the same test as is_premium and the app), or from a
--        member of the artist's team (is_admin_of);
--      * public and published now, unless the author is on the team (the
--        team may limit who sees a post and may schedule it);
--      * 1 to 2,000 characters, title up to 200;
--    and it sets community_id from artist_slug and resets every
--    moderation, AI and prediction column to its default. The service
--    role (announcements, polls, challenges, predictions, the portal
--    composer, crons) and direct SQL are not affected.
--
-- 3. A BEFORE INSERT trigger on community_comments for the same sessions:
--    1 to 1,000 characters, and the moderation columns are reset.
--
-- 4. Comments and reactions can only be added to a post the fan can see
--    (community_post_visible_to_viewer, the function the read policies
--    already use). Reactions are limited to the five the buttons offer.
--
-- 5. Check constraints as a backstop for every writer: post body up to
--    10,000 characters, title up to 200, image alt text up to 500, and
--    comment body up to 2,000. The longest rows in production on
--    2026-11-27 were 299 (post body), 43 (title) and 89 (comment), and
--    every stored reaction was one of the five, so the constraints
--    validate immediately.
--
-- 6. Points:
--      * at most 5 paid posts per fan per activity day (Eastern, the
--        same day boundary comments already use). A post past the cap
--        still saves; it earns nothing. Comments keep their existing cap
--        of 5 a day.
--      * when a post is deleted, the points it earned are taken back.
--        When a comment is deleted by its own author, its points are
--        taken back. A comment removed because someone else deleted the
--        post keeps its points.
--      * the take-back never takes more than the fan still has, is
--        written to points_ledger once under
--        'community_post_removed:<id>' / 'community_comment_removed:<id>',
--        and goes through apply_points_award so totals stay in step.
--
-- No existing row is changed. Safely re-runnable. Rollback:
-- supabase/rollbacks/0110_community_write_guard_rollback.sql.

begin;

-- 1. No fan updates on posts ------------------------------------------------
drop policy if exists community_posts_update on public.community_posts;

-- 2. Post insert guard ------------------------------------------------------
-- SECURITY DEFINER so it can call is_premium, which sessions may not call
-- themselves. It decides who is writing from auth.role(), which the API
-- sets on every request; the service role and direct SQL pass through.
create or replace function public.community_posts_fan_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team boolean;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.kind is distinct from 'post'::community_post_kind then
    raise exception 'Only regular posts can be created here' using errcode = '42501';
  end if;
  if coalesce(new.pinned, false) then
    raise exception 'Posts cannot be pinned here' using errcode = '42501';
  end if;

  v_team := public.is_admin_of(new.artist_slug);
  if not v_team then
    if coalesce(new.visibility, 'public') <> 'public' then
      raise exception 'Only the artist team can limit who sees a post' using errcode = '42501';
    end if;
    if new.scheduled_for is not null then
      raise exception 'Only the artist team can schedule a post' using errcode = '42501';
    end if;
    if not public.is_premium(auth.uid(), new.artist_slug) then
      raise exception 'Premium membership is needed to post' using errcode = '42501';
    end if;
  end if;

  if new.body is null or char_length(btrim(new.body)) = 0 then
    raise exception 'Post is empty' using errcode = '23514';
  end if;
  if char_length(new.body) > 2000 then
    raise exception 'Post is longer than 2000 characters' using errcode = '23514';
  end if;
  if new.title is not null and char_length(new.title) > 200 then
    raise exception 'Title is longer than 200 characters' using errcode = '23514';
  end if;

  -- A post belongs to the community of the artist it is posted to.
  new.community_id := new.artist_slug;

  -- Moderation, AI and prediction columns are the server's to set. Only
  -- the columns this table really has are reset, so the function still
  -- works on a database that is missing a later column.
  new := jsonb_populate_record(
    new,
    (
      select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb)
        from jsonb_each(jsonb_build_object(
          'moderation_status', 'pending',
          'moderation_severity', null,
          'moderation_categories', null,
          'moderation_reason', null,
          'moderation_self_harm', false,
          'moderation_classified_at', null,
          'moderation_model', null,
          'moderation_prompt_version', null,
          'moderation_user_message', null,
          'duplicate_of', null,
          'thread_summary', null,
          'thread_summary_count', null,
          'thread_summary_at', null,
          'tagged_at', null,
          'tag_model', null,
          'tag_prompt_version', null,
          'correct_option_id', null,
          'prediction_closes_at', null,
          'resolved_at', null,
          'points_for_correct', null,
          'announced_at', null
        )) as r
       where to_jsonb(new) ? r.key
    )
  );
  return new;
end $$;

revoke all on function public.community_posts_fan_insert_guard() from public, anon, authenticated;

drop trigger if exists aa_community_posts_fan_insert_guard on public.community_posts;
-- "aa_" so it runs before community_posts_set_community_id (BEFORE INSERT
-- triggers fire in name order).
create trigger aa_community_posts_fan_insert_guard
  before insert on public.community_posts
  for each row execute function public.community_posts_fan_insert_guard();

-- 3. Comment insert guard ---------------------------------------------------
create or replace function public.community_comments_fan_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.body is null or char_length(btrim(new.body)) = 0 then
    raise exception 'Comment is empty' using errcode = '23514';
  end if;
  if char_length(new.body) > 1000 then
    raise exception 'Comment is longer than 1000 characters' using errcode = '23514';
  end if;

  new.moderation_status         := 'pending';
  new.moderation_severity       := null;
  new.moderation_categories     := null;
  new.moderation_reason         := null;
  new.moderation_self_harm      := false;
  new.moderation_classified_at  := null;
  new.moderation_model          := null;
  new.moderation_prompt_version := null;
  return new;
end $$;

revoke all on function public.community_comments_fan_insert_guard() from public, anon, authenticated;

drop trigger if exists aa_community_comments_fan_insert_guard on public.community_comments;
create trigger aa_community_comments_fan_insert_guard
  before insert on public.community_comments
  for each row execute function public.community_comments_fan_insert_guard();

-- 4. Comment and react only on a post you can see ---------------------------
drop policy if exists community_comments_insert on public.community_comments;
create policy community_comments_insert on public.community_comments
  for insert
  with check (auth.uid() = author_id and public.community_post_visible_to_viewer(post_id));

drop policy if exists community_reactions_insert on public.community_reactions;
create policy community_reactions_insert on public.community_reactions
  for insert
  with check (auth.uid() = fan_id and public.community_post_visible_to_viewer(post_id));

-- The five reactions the buttons offer (frontend/lib/community/reactions.ts):
-- red heart, fire, clapping hands, hundred points, face with tears of joy.
alter table public.community_reactions drop constraint if exists community_reactions_emoji_allowed;
alter table public.community_reactions
  add constraint community_reactions_emoji_allowed
  check (emoji in (E'\u2764\uFE0F', E'\U0001F525', E'\U0001F44F', E'\U0001F4AF', E'\U0001F602'));

-- 5. Length backstops for every writer --------------------------------------
alter table public.community_posts drop constraint if exists community_posts_body_length;
alter table public.community_posts
  add constraint community_posts_body_length check (body is null or char_length(body) <= 10000);
alter table public.community_posts drop constraint if exists community_posts_title_length;
alter table public.community_posts
  add constraint community_posts_title_length check (title is null or char_length(title) <= 200);
alter table public.community_posts drop constraint if exists community_posts_image_alt_length;
alter table public.community_posts
  add constraint community_posts_image_alt_length check (image_alt is null or char_length(image_alt) <= 500);
alter table public.community_comments drop constraint if exists community_comments_body_length;
alter table public.community_comments
  add constraint community_comments_body_length check (body is null or char_length(body) <= 2000);

-- 6a. Daily cap on post points ----------------------------------------------
create or replace function public.award_community_post_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref   text := 'community_post:' || new.id::text;
  v_today int;
begin
  if exists (select 1 from points_ledger where source_ref = v_ref) then
    return new;
  end if;

  -- At most 5 paid posts per fan per activity day.
  select count(*) into v_today
    from points_ledger
   where fan_id = new.author_id
     and source_ref like 'community_post:%'
     and delta > 0
     and created_at >= public.activity_day_start();
  if v_today >= 5 then
    return new;
  end if;

  perform public.apply_points_award(new.author_id, 5, 'challenge', v_ref, new.artist_slug, 'Community post');
  return new;
end $function$;

-- 6b. Take points back when a post or comment is removed --------------------
create or replace function public.take_back_community_points(
  p_fan_id uuid,
  p_earned_ref text,
  p_removed_ref text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_earned    int;
  v_community text;
  v_balance   int;
  v_take      int;
begin
  select coalesce(sum(delta), 0), max(community_id) into v_earned, v_community
    from points_ledger
   where source_ref = p_earned_ref and fan_id = p_fan_id and delta > 0;
  if v_earned <= 0 then
    return;
  end if;
  if exists (select 1 from points_ledger where source_ref = p_removed_ref) then
    return;
  end if;

  perform 1 from fans where id = p_fan_id for update;
  if not found then
    return;  -- the fan account itself is being deleted
  end if;

  -- Never take more than the fan still has: points already spent stay spent.
  v_balance := public.fan_ledger_balance(p_fan_id);
  v_take := least(v_earned, greatest(v_balance, 0));
  if v_take <= 0 then
    return;
  end if;

  perform public.apply_points_award(p_fan_id, -v_take, 'challenge', p_removed_ref, v_community, p_note);
end $function$;

revoke all on function public.take_back_community_points(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.community_posts_take_back_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.take_back_community_points(
    old.author_id,
    'community_post:' || old.id::text,
    'community_post_removed:' || old.id::text,
    'Community post removed'
  );
  return old;
end $function$;

revoke all on function public.community_posts_take_back_points() from public, anon, authenticated;

drop trigger if exists community_posts_take_back_points on public.community_posts;
create trigger community_posts_take_back_points
  after delete on public.community_posts
  for each row execute function public.community_posts_take_back_points();

create or replace function public.community_comments_take_back_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Only when the comment's own author removes it. auth.uid() is the
  -- signed-in fan of the request (null for the service role), so a comment
  -- swept away when someone else deletes the post keeps its points.
  if auth.uid() is distinct from old.author_id then
    return old;
  end if;
  perform public.take_back_community_points(
    old.author_id,
    'community_comment:' || old.id::text,
    'community_comment_removed:' || old.id::text,
    'Community comment removed'
  );
  return old;
end $function$;

revoke all on function public.community_comments_take_back_points() from public, anon, authenticated;

drop trigger if exists community_comments_take_back_points on public.community_comments;
create trigger community_comments_take_back_points
  after delete on public.community_comments
  for each row execute function public.community_comments_take_back_points();

commit;
