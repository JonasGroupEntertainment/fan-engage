-- 0111_storage_upload_limits.sql
--
-- Applied to production on 2026-11-27 (ledger version 20261127175007), before
-- this file was pushed.
--
-- Size and file type limits on the three upload buckets. Port of Brand
-- Engage Pro 0125. Storage enforces these on every upload, however it is
-- made:
--   avatars, community-uploads: 8 MB, JPEG / PNG / WebP / GIF only (the
--     same list and size /api/upload allows).
--   community-videos: keeps its 50 MB limit, now MP4 / WebM / QuickTime
--     only (the list the video uploader accepts).
--
-- Files already stored are not touched. On 2026-11-27 production held 49
-- pictures (JPEG and PNG, the largest under 1 MB) and one MP4 of 4.4 MB,
-- so nothing in use falls outside the new rules. Safely re-runnable.
--
-- Rollback: update the same rows back to file_size_limit = null and
-- allowed_mime_types = null (community-videos: 52428800 and null).

do $$
begin
  -- Supabase's storage.buckets has both columns. A bare test database may
  -- not, so the update is skipped there.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) and exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    update storage.buckets
       set file_size_limit = 8388608,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
     where id in ('avatars', 'community-uploads');

    update storage.buckets
       set file_size_limit = 52428800,
           allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime']
     where id = 'community-videos';
  end if;
end $$;
