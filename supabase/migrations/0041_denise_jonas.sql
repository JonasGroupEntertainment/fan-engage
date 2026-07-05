-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — 0041: Add Denise Jonas (denise-jonas-site.vercel.app)
--
-- Provisions the community + artist rows for Denise Jonas — mother of the
-- Jonas Brothers (Nick, Joe, Kevin, and Franklin) and grandmother of five.
-- Hero image + focal point pulled from her personal site; accents match its
-- monochrome-with-warm-gold editorial style.
--
-- Starts ACTIVE — personal/family property, no agreement gate.
-- Idempotent via ON CONFLICT DO UPDATE.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1. Community row ─────────────────────────────────────────────────────
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
  'denise-jonas',
  'Denise Jonas',
  'artist',
  'Mother · Grandmother · Homemaker',
  'Denise Jonas is the mother of Nick, Joe, Kevin, and Franklin Jonas and grandmother to five beautiful granddaughters. Her New Jersey kitchen has always been the family headquarters — where tour decisions were weighed over pot roast, and where grandchildren now learn to roll biscuit dough from recipes that hang on the walls of Nellie''s Southern Kitchen. After recovering from a stroke with the same grace she brings to everything else, Denise has become a quiet source of strength for women who believe the best chapters come after sixty. Style, beauty, the family kitchen, and the Sunday Table — grace, excellence, family.',
  '#1f2937',
  '#d4b483',
  'denisejonas',
  true,
  8
)
on conflict (slug) do update set
  display_name = excluded.display_name,
  type         = excluded.type,
  tagline      = excluded.tagline,
  bio          = excluded.bio,
  accent_from  = excluded.accent_from,
  accent_to    = excluded.accent_to,
  subdomain    = excluded.subdomain,
  sort_order   = excluded.sort_order;


-- ─── 2. Artist row ────────────────────────────────────────────────────────
insert into public.artists (
  slug,
  name,
  tagline,
  bio,
  hero_image,
  hero_focal_x,
  hero_focal_y,
  accent_from,
  accent_to,
  genres,
  social,
  active,
  sort_order
) values (
  'denise-jonas',
  'Denise Jonas',
  'Mother · Grandmother · Homemaker',
  'Denise Jonas is the mother of Nick, Joe, Kevin, and Franklin Jonas and grandmother to five beautiful granddaughters. Her New Jersey kitchen has always been the family headquarters — where tour decisions were weighed over pot roast, and where grandchildren now learn to roll biscuit dough from recipes that hang on the walls of Nellie''s Southern Kitchen. After recovering from a stroke with the same grace she brings to everything else, Denise has become a quiet source of strength for women who believe the best chapters come after sixty. Style, beauty, the family kitchen, and the Sunday Table — grace, excellence, family.',
  'https://denise-jonas-site.vercel.app/assets/denise-venice-web.jpg',
  50,
  22,
  '#1f2937',
  '#d4b483',
  array['Lifestyle', 'Family']::text[],
  '[
    {"label": "Website", "href": "https://denise-jonas-site.vercel.app/"}
  ]'::jsonb,
  true,
  8
)
on conflict (slug) do update set
  name         = excluded.name,
  tagline      = excluded.tagline,
  bio          = excluded.bio,
  hero_image   = excluded.hero_image,
  hero_focal_x = excluded.hero_focal_x,
  hero_focal_y = excluded.hero_focal_y,
  accent_from  = excluded.accent_from,
  accent_to    = excluded.accent_to,
  genres       = excluded.genres,
  social       = excluded.social,
  active       = excluded.active,
  sort_order   = excluded.sort_order;
