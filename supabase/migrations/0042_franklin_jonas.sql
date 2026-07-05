-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — 0042: Add Franklin Jonas & The Byzantines
--
-- Provisions the community + artist rows. Bio, hero, socials pulled from
-- franklin-jonas-site.vercel.app (franklin-jonas.com DNS cutover pending).
-- Accents: byzantine purple → gold, after the band's namesake and the
-- site's yellow logo mark.
--
-- Starts ACTIVE — family/roster artist with a live site and current single
-- (High and Sad with Noah Cyrus). Idempotent via ON CONFLICT DO UPDATE.
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
  'franklin-jonas',
  'Franklin Jonas & The Byzantines',
  'artist',
  'Survival, reinvention, and belief in what comes next.',
  'Franklin Jonas is an artist and songwriter from New Jersey, carving his own path with a sound rooted in storytelling, reflection, and renewal. After releasing his debut EP Sewer Rat in his early twenties, Franklin took a step back from releasing music to discover his voice, his influences, and his sense of self. That exploration gave rise to Franklin Jonas & The Byzantines — inspired by the idea that life can be rebuilt after collapse, just as the Roman Empire lived on in Byzantium for a thousand years after its supposed fall. The singles Village Liquors, Road Soda, and Break the Levee opened this chapter; High and Sad — reimagined with Noah Cyrus, his co-star from Studio Ghibli''s Ponyo nearly twenty years ago — carries it forward. A Blackbird Academy–trained engineer, he writes, records, and produces the records himself. First of Many Tour — his first-ever headline run — hits the road Fall 2026.',
  '#3b0764',
  '#facc15',
  'franklinjonas',
  true,
  9
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
  'franklin-jonas',
  'Franklin Jonas & The Byzantines',
  'Survival, reinvention, and belief in what comes next.',
  'Franklin Jonas is an artist and songwriter from New Jersey, carving his own path with a sound rooted in storytelling, reflection, and renewal. After releasing his debut EP Sewer Rat in his early twenties, Franklin took a step back from releasing music to discover his voice, his influences, and his sense of self. That exploration gave rise to Franklin Jonas & The Byzantines — inspired by the idea that life can be rebuilt after collapse, just as the Roman Empire lived on in Byzantium for a thousand years after its supposed fall. The singles Village Liquors, Road Soda, and Break the Levee opened this chapter; High and Sad — reimagined with Noah Cyrus, his co-star from Studio Ghibli''s Ponyo nearly twenty years ago — carries it forward. A Blackbird Academy–trained engineer, he writes, records, and produces the records himself. First of Many Tour — his first-ever headline run — hits the road Fall 2026.',
  'https://franklin-jonas-site.vercel.app/assets/bandsintown-artist-photo.jpeg',
  50,
  30,
  '#3b0764',
  '#facc15',
  array['Alt-Folk', 'Indie Rock']::text[],
  '[
    {"label": "Spotify", "href": "https://open.spotify.com/artist/0CiDBbLe1R6VLQ4wXgRHoV"},
    {"label": "Apple Music", "href": "https://music.apple.com/us/artist/franklin-jonas-the-byzantines/1832096129"},
    {"label": "Instagram", "href": "https://www.instagram.com/franklinjonas/"},
    {"label": "TikTok", "href": "https://www.tiktok.com/@iamfranklinjonas"},
    {"label": "YouTube", "href": "https://www.youtube.com/@franklinjonas"},
    {"label": "Website", "href": "https://franklin-jonas-site.vercel.app/"}
  ]'::jsonb,
  true,
  9
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
