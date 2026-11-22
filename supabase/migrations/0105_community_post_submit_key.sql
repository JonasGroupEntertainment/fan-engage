-- 0105_community_post_submit_key.sql
--
-- Not yet applied to production.
--
-- Saves a community post once per press of the button. Port of Brand
-- Engage Pro 0119.
--
-- The post forms (frontend/app/artists/[slug]/community/new-post-form.tsx
-- and frontend/app/artist-portal/community/composer.tsx) retry a save when
-- the server answers with an error, and the create actions are not safe to
-- repeat, so a retry used to make the same post, announcement, poll or
-- challenge twice. The forms now send one fresh uuid per press, and every
-- automatic retry of that press carries the same uuid. This column stores
-- it, and the unique index makes the database refuse a second row from the
-- same author with the same uuid. The app then answers the retry with the
-- row that was already saved. A refused insert fires no insert triggers,
-- so points and badges are not awarded again. See
-- frontend/lib/community/save-once.ts.
--
-- Nullable, with no default and no backfill: every existing row, and any
-- row saved by a path that sends no uuid, keeps null and is not checked.
-- The index covers only rows that have a value.
--
-- The index is on (author_id, submit_key), not on submit_key alone, so a
-- value only ever clashes with the same person's own rows. Nobody can
-- block or probe another person's post by reusing a value.
--
-- Who writes the column: fan posts are inserted with the fan's own
-- session (policy community_posts_insert, auth.uid() = author_id, and the
-- table wide grant to authenticated, which covers new columns; no
-- migration sets column level grants on this table). Announcements,
-- polls, challenges and everything from the artist portal are inserted
-- with the service role. No policy or grant change is needed.
--
-- The app is safe to deploy before this is applied: while the column is
-- missing it saves each post without it, exactly as before.
--
-- The index is created without `concurrently`, so it takes a brief write
-- lock on community_posts while it scans the table. Apply this at a quiet
-- moment.
--
-- No new enum values. Safely re-runnable. Two statements: if you paste
-- this into the Supabase SQL editor, run them one at a time.

alter table public.community_posts
  add column if not exists submit_key uuid;

create unique index if not exists community_posts_author_submit_key_idx
  on public.community_posts (author_id, submit_key)
  where submit_key is not null;
