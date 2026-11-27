-- Rollback for 0110_community_write_guard.sql
--
-- Review-only. Do not apply unless Kevin says so.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg
--
-- Puts the community write rules back to what they were before 0110:
-- the insert guards, the take-back triggers and the constraints are
-- removed, the policies return to "you are the author", and
-- award_community_post_points returns to its uncapped form. Ledger rows
-- written by a take-back are left in place.

begin;

drop trigger if exists aa_community_posts_fan_insert_guard on public.community_posts;
drop trigger if exists aa_community_comments_fan_insert_guard on public.community_comments;
drop trigger if exists community_posts_take_back_points on public.community_posts;
drop trigger if exists community_comments_take_back_points on public.community_comments;
drop function if exists public.community_posts_fan_insert_guard();
drop function if exists public.community_comments_fan_insert_guard();
drop function if exists public.community_posts_take_back_points();
drop function if exists public.community_comments_take_back_points();
drop function if exists public.take_back_community_points(uuid, text, text, text);

alter table public.community_posts drop constraint if exists community_posts_body_length;
alter table public.community_posts drop constraint if exists community_posts_title_length;
alter table public.community_posts drop constraint if exists community_posts_image_alt_length;
alter table public.community_comments drop constraint if exists community_comments_body_length;
alter table public.community_reactions drop constraint if exists community_reactions_emoji_allowed;

drop policy if exists community_posts_update on public.community_posts;
create policy community_posts_update on public.community_posts
  for update using (auth.uid() = author_id);

drop policy if exists community_comments_insert on public.community_comments;
create policy community_comments_insert on public.community_comments
  for insert with check (auth.uid() = author_id);

drop policy if exists community_reactions_insert on public.community_reactions;
create policy community_reactions_insert on public.community_reactions
  for insert with check (auth.uid() = fan_id);

create or replace function public.award_community_post_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.apply_points_award(new.author_id, 5, 'challenge', 'community_post:' || new.id::text, new.artist_slug, 'Community post');
  return new;
end $function$;

commit;
