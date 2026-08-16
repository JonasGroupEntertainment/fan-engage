-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — 0052: Amy Stroup inactive invite/community pool
--
-- Splits Amy solo from Danger Twins. `amystroup` previously aliased to
-- `danger-twins` in COMMUNITY_BY_SUBDOMAIN; they are now separate pools.
--
-- This is NOT a launch. Both rows start and stay inactive. Do not add Amy
-- to featured/home/launch catalog. Do not touch bailee, bailee-madison,
-- denise-jonas, franklin-jonas, or raelynn.
--
-- Idempotent via ON CONFLICT DO UPDATE.
-- Apply via: Supabase dashboard → SQL Editor → paste this file → Run.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1. Community row (inactive pool only) ────────────────────────────────
insert into public.communities (
  slug,
  display_name,
  type,
  tagline,
  bio,
  accent_from,
  accent_to,
  subdomain,
  active,
  sort_order
) values (
  'amy-stroup',
  'Amy Stroup',
  'artist',
  'Placeholder tagline — awaiting final copy from marketing.',
  'Placeholder bio — awaiting final copy from marketing.',
  '#7c3aed',
  '#fb923c',
  'amystroup',
  false,
  10
)
on conflict (slug) do update set
  display_name = excluded.display_name,
  type         = excluded.type,
  tagline      = excluded.tagline,
  bio          = excluded.bio,
  accent_from  = excluded.accent_from,
  accent_to    = excluded.accent_to,
  subdomain    = excluded.subdomain,
  active       = false,
  sort_order   = excluded.sort_order;


-- ─── 2. Artist row (inactive; omitted from public /artists lists) ──────────
insert into public.artists (
  slug,
  name,
  tagline,
  bio,
  hero_image,
  accent_from,
  accent_to,
  genres,
  social,
  active,
  sort_order
) values (
  'amy-stroup',
  'Amy Stroup',
  'Placeholder tagline — awaiting final copy from marketing.',
  'Placeholder bio — awaiting final copy from marketing.',
  null,
  '#7c3aed',
  '#fb923c',
  '{}'::text[],
  '[]'::jsonb,
  false,
  10
)
on conflict (slug) do update set
  name         = excluded.name,
  tagline      = excluded.tagline,
  bio          = excluded.bio,
  accent_from  = excluded.accent_from,
  accent_to    = excluded.accent_to,
  genres       = excluded.genres,
  social       = excluded.social,
  active       = false,
  sort_order   = excluded.sort_order;
