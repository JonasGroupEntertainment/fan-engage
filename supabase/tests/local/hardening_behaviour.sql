\set QUIET on
create or replace function pg_temp.as_fan(p text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', p, true); perform set_config('request.jwt.claim.role', 'authenticated', true); execute 'set local role authenticated'; end $$;
create temp table results (n serial, name text, ok boolean);
grant all on results to public; grant usage on sequence results_n_seq to public;
create or replace function pg_temp.expect_fail(p_name text, p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into results(name, ok) values (p_name || ' [was allowed]', false);
  exception when others then insert into results(name, ok) values (p_name || ' -> ' || sqlerrm, sqlerrm ilike p_like); end;
end $$;
create or replace function pg_temp.expect_ok(p_name text, p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into results(name, ok) values (p_name, true);
  exception when others then insert into results(name, ok) values (p_name || ' -> ' || sqlerrm, false); end;
end $$;
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
begin;
select pg_temp.as_fan(:'A');
select pg_temp.expect_ok('premium fan posts a plain post', $q$insert into community_posts (artist_slug, author_id, body) values ('raelynn', auth.uid(), 'hello')$q$);
select pg_temp.expect_fail('premium fan cannot post as an announcement', $q$insert into community_posts (artist_slug, author_id, body, kind) values ('raelynn', auth.uid(), 'x', 'announcement')$q$, '%regular posts%');
select pg_temp.expect_fail('premium fan cannot pin', $q$insert into community_posts (artist_slug, author_id, body, pinned) values ('raelynn', auth.uid(), 'x', true)$q$, '%pinned%');
select pg_temp.expect_fail('premium fan cannot make a premium-only post', $q$insert into community_posts (artist_slug, author_id, body, visibility) values ('raelynn', auth.uid(), 'x', 'premium')$q$, '%artist team%');
select pg_temp.expect_fail('premium fan cannot schedule', $q$insert into community_posts (artist_slug, author_id, body, scheduled_for) values ('raelynn', auth.uid(), 'x', now() + interval '1 day')$q$, '%schedule%');
select pg_temp.expect_fail('empty post refused', $q$insert into community_posts (artist_slug, author_id, body) values ('raelynn', auth.uid(), '   ')$q$, '%empty%');
select pg_temp.expect_fail('over-long post refused', $q$insert into community_posts (artist_slug, author_id, body) values ('raelynn', auth.uid(), repeat('a', 2001))$q$, '%2000%');
select pg_temp.expect_fail('cannot post as someone else', $q$insert into community_posts (artist_slug, author_id, body) values ('raelynn', '00000000-0000-0000-0000-00000000000b', 'x')$q$, '%row-level security%');
select pg_temp.expect_ok('a post dated in the far future is saved', $q$insert into community_posts (artist_slug, author_id, body, created_at) values ('raelynn', auth.uid(), 'time traveller', '2100-01-01')$q$);
select pg_temp.expect_ok('pre-approved post is saved', $q$insert into community_posts (artist_slug, author_id, body, moderation_status, moderation_severity, duplicate_of, announced_at, community_id) values ('raelynn', auth.uid(), 'sneaky', 'safe', 0, null, now(), 'other-artist')$q$);
commit;
insert into results(name, ok) select 'the far-future date was replaced by the server time', created_at < now() + interval '1 minute' from community_posts where body = 'time traveller';
insert into results(name, ok) select 'pre-approved post was reset to pending, own community, not announced', (moderation_status = 'pending' and moderation_severity is null and announced_at is null and community_id = 'raelynn') from community_posts where body = 'sneaky';
begin;
select pg_temp.as_fan(:'A');
select pg_temp.expect_fail('fan can no longer update a post', $q$do $d$ declare n int; begin update community_posts set pinned = true where author_id = auth.uid(); get diagnostics n = row_count; if n = 0 then raise exception 'no rows updated'; end if; end $d$$q$, '%no rows updated%');
commit;
begin;
select pg_temp.as_fan(:'B');
select pg_temp.expect_fail('free fan cannot post', $q$insert into community_posts (artist_slug, author_id, body) values ('raelynn', auth.uid(), 'x')$q$, '%Premium%');
select pg_temp.expect_ok('free fan can comment on a post they can see', $q$insert into community_comments (post_id, author_id, body) select id, auth.uid(), 'nice' from community_posts where body = 'hello'$q$);
select pg_temp.expect_fail('over-long comment refused', $q$insert into community_comments (post_id, author_id, body) select id, auth.uid(), repeat('a', 1001) from community_posts where body = 'hello'$q$, '%1000%');
select pg_temp.expect_ok('free fan can react with an offered reaction', $q$insert into community_reactions (post_id, fan_id, emoji) select id, auth.uid(), E'\U0001F525' from community_posts where body = 'hello'$q$);
select pg_temp.expect_fail('other text as a reaction refused', $q$insert into community_reactions (post_id, fan_id, emoji) select id, auth.uid(), 'visit example.com' from community_posts where body = 'hello'$q$, '%emoji_allowed%');
commit;
begin;
select pg_temp.as_fan(:'C');
select pg_temp.expect_ok('team author posts a premium-only scheduled post with their own session', $q$insert into community_posts (artist_slug, author_id, body, visibility, scheduled_for) values ('raelynn', auth.uid(), 'team only', 'premium', now() + interval '1 day')$q$);
select pg_temp.expect_fail('team author still cannot pin through this door', $q$insert into community_posts (artist_slug, author_id, body, pinned) values ('raelynn', auth.uid(), 'x', true)$q$, '%pinned%');
commit;
begin;
select pg_temp.as_fan(:'B');
select pg_temp.expect_fail('free fan cannot comment on a post they cannot see', $q$insert into community_comments (post_id, author_id, body) select id, auth.uid(), 'hi' from community_posts where body = 'team only'$q$, '%row-level security%');
select pg_temp.expect_fail('free fan cannot react to a post they cannot see', $q$insert into community_reactions (post_id, fan_id, emoji) select id, auth.uid(), E'\U0001F525' from community_posts where body = 'team only'$q$, '%row-level security%');
commit;
-- polls and challenges
begin;
select set_config('request.jwt.claim.role', 'service_role', true); set local role service_role;
insert into community_posts (id, artist_slug, author_id, body, kind) values ('00000000-0000-0000-0000-0000000000d1', 'raelynn', '00000000-0000-0000-0000-00000000000c', 'poll one', 'poll'), ('00000000-0000-0000-0000-0000000000d2', 'raelynn', '00000000-0000-0000-0000-00000000000c', 'poll two', 'poll'), ('00000000-0000-0000-0000-0000000000d3', 'raelynn', '00000000-0000-0000-0000-00000000000c', 'challenge one', 'challenge');
insert into community_posts (id, artist_slug, author_id, body, kind, visibility) values ('00000000-0000-0000-0000-0000000000d4', 'raelynn', '00000000-0000-0000-0000-00000000000c', 'premium poll', 'poll', 'premium');
insert into community_poll_options (id, post_id, label) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'yes'), ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', 'other poll'), ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000d4', 'premium option');
commit;
begin;
select pg_temp.as_fan(:'B');
select pg_temp.expect_fail('a vote for another poll''s option is refused', $q$insert into community_poll_votes (post_id, fan_id, option_id) values ('00000000-0000-0000-0000-0000000000d1', auth.uid(), '00000000-0000-0000-0000-0000000000e2')$q$, '%does not belong%');
select pg_temp.expect_ok('a vote for the poll''s own option is saved', $q$insert into community_poll_votes (post_id, fan_id, option_id) values ('00000000-0000-0000-0000-0000000000d1', auth.uid(), '00000000-0000-0000-0000-0000000000e1')$q$);
select pg_temp.expect_fail('a challenge entry on a post that is not a challenge is refused', $q$insert into community_challenge_entries (post_id, fan_id, body) values ('00000000-0000-0000-0000-0000000000d1', auth.uid(), 'x')$q$, '%not a challenge%');
select pg_temp.expect_ok('a challenge entry on a challenge is saved', $q$insert into community_challenge_entries (post_id, fan_id, body, created_at) values ('00000000-0000-0000-0000-0000000000d3', auth.uid(), 'my entry', '2100-01-01')$q$);
select pg_temp.expect_fail('a vote on a post the fan cannot see is refused', $q$insert into community_poll_votes (post_id, fan_id, option_id) values ('00000000-0000-0000-0000-0000000000d4', auth.uid(), '00000000-0000-0000-0000-0000000000e4')$q$, '%row-level security%');
commit;
insert into results(name, ok) select 'the entry''s date is the server time', created_at < now() + interval '1 minute' from community_challenge_entries where body = 'my entry';
-- service role: full control
begin;
select set_config('request.jwt.claim.role', 'service_role', true); set local role service_role;
select pg_temp.expect_ok('service role can post a pinned announcement', $q$insert into community_posts (artist_slug, author_id, body, kind, pinned, moderation_status) values ('raelynn', '00000000-0000-0000-0000-00000000000c', 'news', 'announcement', true, 'safe')$q$);
select pg_temp.expect_ok('service role can update a post', $q$update community_posts set pinned = true where body = 'hello'$q$);
commit;
insert into results(name, ok) select 'announcement kept its approved status', moderation_status = 'safe' from community_posts where body = 'news';
-- points: cap and take-back
insert into results(name, ok) select 'three posts by the premium fan earned 15 points', (select total_points from fans where id = :'A') = 15;
begin;
select pg_temp.as_fan(:'A');
insert into community_posts (artist_slug, author_id, body) select 'raelynn', auth.uid(), 'p' || g from generate_series(1, 6) g;
commit;
insert into results(name, ok) select 'post points stop at 5 paid posts a day (25 points)', (select total_points from fans where id = :'A') = 25;
insert into results(name, ok) select 'all 9 posts were saved', (select count(*) from community_posts where author_id = :'A') = 9;
begin;
select pg_temp.as_fan(:'A');
delete from community_posts where body = 'hello';
commit;
insert into results(name, ok) select 'deleting a paid post takes its 5 points back', (select total_points from fans where id = :'A') = 20;
insert into results(name, ok) select 'take-back is in the ledger once', (select count(*) from points_ledger where source_ref like 'community_post_removed:%') = 1;
insert into results(name, ok) select 'the free fan kept comment points when the post was deleted by its author', (select total_points from fans where id = :'B') = 10;
begin;
select pg_temp.as_fan(:'A');
delete from community_posts where body = 'p6';
commit;
insert into results(name, ok) select 'deleting an unpaid post takes nothing', (select total_points from fans where id = :'A') = 20;
-- spent points stay spent
insert into points_ledger (fan_id, delta, source, source_ref, community_id) values (:'A', -18, 'reward_redemption', 'redemption:test', 'raelynn');
select sync_points_from_ledger(:'A');
begin;
select pg_temp.as_fan(:'A');
delete from community_posts where body = 'sneaky';
commit;
insert into results(name, ok) select 'take-back never goes below zero', (select total_points from fans where id = :'A') = 0;
-- comment take-back by own author
begin;
select pg_temp.as_fan(:'B');
insert into community_comments (post_id, author_id, body) select id, auth.uid(), 'mine' from community_posts where body = 'p1';
commit;
insert into results(name, ok) select 'comment earned 10', (select total_points from fans where id = :'B') = 20;
begin;
select pg_temp.as_fan(:'B');
delete from community_comments where body = 'mine';
commit;
insert into results(name, ok) select 'deleting your own comment takes its points back', (select total_points from fans where id = :'B') = 10;
-- deleting a fan account still works (cascade through posts and comments)
select pg_temp.expect_ok('a fan account can still be deleted', $q$delete from fans where id = '00000000-0000-0000-0000-00000000000a'$q$);
-- redemption: one waiting per reward
insert into reward_redemptions (fan_id, reward_id, status) values (:'B', '00000000-0000-0000-0000-0000000000f1', 'pending');
select pg_temp.expect_fail('second waiting redemption of the same reward refused', $q$insert into reward_redemptions (fan_id, reward_id, status) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1', 'pending')$q$, '%one_pending_per_reward%');
update reward_redemptions set status = 'fulfilled';
select pg_temp.expect_ok('after it is fulfilled the reward can be redeemed again', $q$insert into reward_redemptions (fan_id, reward_id, status) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1', 'pending')$q$);
-- text limits and buckets
select pg_temp.expect_fail('a 51 character first name is refused', $q$update fans set first_name = repeat('a', 51) where id = '00000000-0000-0000-0000-00000000000b'$q$, '%first_name_length%');
select pg_temp.expect_ok('a 50 character first name is fine', $q$update fans set first_name = repeat('a', 50) where id = '00000000-0000-0000-0000-00000000000b'$q$);
insert into results(name, ok) select 'picture buckets limited to 8 MB and four image types', bool_and(file_size_limit = 8388608 and allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']) from storage.buckets where id in ('avatars','community-uploads');
insert into results(name, ok) select 'video bucket limited to three video types', allowed_mime_types = array['video/mp4','video/webm','video/quicktime'] and file_size_limit = 52428800 from storage.buckets where id = 'community-videos';
\pset format unaligned
\pset tuples_only on
select case when ok then 'PASS  ' else 'FAIL  ' end || left(name, 150) from results order by n;
select 'TOTAL ' || count(*) || ' pass ' || count(*) filter (where ok) || ' fail ' || count(*) filter (where not ok) from results;
