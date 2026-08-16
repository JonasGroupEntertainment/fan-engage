-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — RaeLynn official X handle
--
-- Live artists.social (slug = 'raelynn') had X at
--   https://x.com/raelynnofficial
-- Official account is https://x.com/RaeLynn (@RaeLynn).
-- @raelynnofficial on X is the wrong account. Do not use it.
--
-- Instagram / TikTok / Facebook raelynnofficial are correct — do not touch.
--
-- Idempotent. No-op if Cody already applied the prod UPDATE.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg
--
-- Prod SQL (same as below) if this file is not applied via migrate:
--
--   update public.artists
--   set social = (
--     select coalesce(jsonb_agg(
--       case
--         when (e->>'href') ~* '^https?://(www\.)?(x|twitter)\.com/@?raelynnofficial/?$'
--         then jsonb_set(e, '{href}', '"https://x.com/RaeLynn"')
--         else e
--       end
--       order by ord
--     ), social)
--     from jsonb_array_elements(social) with ordinality as t(e, ord)
--   )
--   where slug = 'raelynn';
-- ────────────────────────────────────────────────────────────────────────────

-- Rewrite only X / Twitter hrefs that still point at raelynnofficial.
update public.artists
set social = (
  select coalesce(
    jsonb_agg(
      case
        when (e->>'href') ~* '^https?://(www\.)?(x|twitter)\.com/@?raelynnofficial/?$'
        then jsonb_set(e, '{href}', '"https://x.com/RaeLynn"')
        else e
      end
      order by ord
    ),
    social
  )
  from jsonb_array_elements(social) with ordinality as t(e, ord)
)
where slug = 'raelynn';

-- Fresh 0006 seed is Instagram-only. If no X/Twitter entry exists, append
-- the official handle. Does not add or change any other platform.
update public.artists
set social = social || '[{"label":"X","href":"https://x.com/RaeLynn"}]'::jsonb
where slug = 'raelynn'
  and not exists (
    select 1
    from jsonb_array_elements(social) e
    where (e->>'href') ~* '^https?://(www\.)?(x|twitter)\.com/'
       or lower(coalesce(e->>'label', '')) in ('x', 'twitter', 'twitter / x')
  );
