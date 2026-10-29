-- 0093_is_founder_execute_for_rls.sql
--
-- 0091's community_posts_public_read policy calls
-- is_founder(auth.uid(), artist_slug), but 0019 granted execute on is_founder
-- only to service_role. RLS policy expressions run as the calling role, so
-- every anon / authenticated read of community_posts failed with
-- "permission denied for function is_founder" and the public feed rendered
-- "Nothing posted yet" for ~6 minutes on 2026-10-29 until this grant was
-- applied. The function is SECURITY DEFINER and returns only a boolean about
-- the caller's own founding status, so client execute is safe.
--
-- Lesson for future policies: any function referenced inside a policy
-- expression must be executable by the roles the policy applies to.
-- Idempotent.

grant execute on function public.is_founder(uuid, text) to anon, authenticated;

-- ─── Verify (SQL editor) ───────────────────────────────────────────────────
-- begin; set local role anon;
-- select count(*) from community_posts where artist_slug = 'raelynn';
-- rollback;
-- -- Expected: the public post count, not "permission denied for function is_founder"
