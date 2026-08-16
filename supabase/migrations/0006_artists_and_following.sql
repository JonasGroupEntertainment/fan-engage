-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — Phase 3a: artists CRUD + events + per-artist following
-- Safe to re-run (idempotent).
-- Apply via: Supabase dashboard → SQL Editor → paste → Run.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Artists (moves from hardcoded lib/artists.ts into Supabase) ──────────
create table if not exists public.artists (
  slug          text primary key,
  name          text not null,
  tagline       text,
  bio           text,
  hero_image    text,
  accent_from   text not null default '#7c3aed',
  accent_to     text not null default '#f97316',
  genres        text[] not null default '{}',
  social        jsonb not null default '[]'::jsonb,       -- [{label, href}]
  active        boolean not null default true,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── Artist events (upcoming shows / livestreams / listening parties) ─────
create table if not exists public.artist_events (
  id            uuid primary key default gen_random_uuid(),
  artist_slug   text not null references public.artists(slug) on delete cascade,
  title         text not null,
  detail        text,
  event_date    text,              -- free-form ("Coming soon" / "Mar 14, 2026")
  url           text,              -- ticket / livestream link
  sort_order    smallint not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists artist_events_artist_idx
  on public.artist_events (artist_slug, active, sort_order);

-- ─── Fan → artist following (per-artist audience segmentation) ────────────
create table if not exists public.fan_artist_following (
  fan_id        uuid not null references public.fans(id) on delete cascade,
  artist_slug   text not null references public.artists(slug) on delete cascade,
  followed_at   timestamptz not null default now(),
  primary key (fan_id, artist_slug)
);

create index if not exists fan_artist_following_artist_idx
  on public.fan_artist_following (artist_slug);

-- ─── Updated-at trigger for artists ───────────────────────────────────────
drop trigger if exists artists_set_updated_at on public.artists;
create trigger artists_set_updated_at
  before update on public.artists
  for each row execute function public.set_updated_at();

-- ─── Seed artists from hardcoded data (upsert; safe to re-run) ────────────
insert into public.artists (slug, name, tagline, bio, accent_from, accent_to, genres, social, sort_order) values
  -- Official X is https://x.com/RaeLynn (@RaeLynn). Do not put raelynnofficial
  -- on X — that handle is not her account. Instagram/TikTok/Facebook
  -- raelynnofficial stay as-is (those platforms are correct).
  ('raelynn', 'RaeLynn', 'Country, heart-first.',             'Placeholder bio — awaiting final copy from marketing.', '#f43f5e', '#fbbf24', '{"Country","Americana"}', '[{"label":"Instagram","href":"https://instagram.com/raelynn"},{"label":"X","href":"https://x.com/RaeLynn"}]'::jsonb, 1),
  ('bailee',  'Bailee',  'Rising voice, no ceiling.',         'Placeholder bio — awaiting assets from Box drop.',       '#8b5cf6', '#e879f9', '{"Pop"}',                 '[]'::jsonb, 2),
  ('blake',   'Blake',   'Studio-raw, stadium-ready.',        'Placeholder bio — awaiting assets from Box drop.',       '#0ea5e9', '#34d399', '{"Country","Rock"}',      '[]'::jsonb, 3),
  ('konnor',  'Konnor',  'New-school songwriting.',           'Placeholder bio — awaiting assets from Box drop.',       '#f59e0b', '#fb923c', '{"Pop","Indie"}',         '[]'::jsonb, 4),
  ('dan',     'Dan',     'Heartland heart, modern punch.',    'Placeholder bio — awaiting assets from Box drop.',       '#64748b', '#60a5fa', '{"Country"}',             '[]'::jsonb, 5)
on conflict (slug) do update set
  name        = excluded.name,
  tagline     = coalesce(artists.tagline, excluded.tagline),
  bio         = coalesce(artists.bio,     excluded.bio),
  accent_from = excluded.accent_from,
  accent_to   = excluded.accent_to,
  genres      = excluded.genres,
  -- Preserve CMS/live socials on re-seed. Overwriting would wipe TikTok /
  -- Facebook / Spotify / site links and could put a stub X handle back.
  -- X correction is 20260816194300_raelynn_official_x_handle.sql.
  sort_order  = excluded.sort_order;

-- Seed one placeholder event per artist (only if they have zero events yet)
insert into public.artist_events (artist_slug, title, detail, event_date, sort_order)
select a.slug, 'TBD', 'Dates to come', '—', 0
from public.artists a
where not exists (
  select 1 from public.artist_events e where e.artist_slug = a.slug
);

-- Upsert the RaeLynn listening-party entry specifically
insert into public.artist_events (artist_slug, title, detail, event_date, sort_order)
select 'raelynn', 'Nashville Listening Party', 'Fan Engage members only', 'Coming soon', 1
where exists (select 1 from public.artists where slug = 'raelynn')
  and not exists (
    select 1 from public.artist_events
    where artist_slug = 'raelynn' and title = 'Nashville Listening Party'
  );

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table public.artists              enable row level security;
alter table public.artist_events        enable row level security;
alter table public.fan_artist_following enable row level security;

-- Public read for artists + events (anyone can browse artist pages)
drop policy if exists artists_public_read on public.artists;
create policy artists_public_read on public.artists
  for select using (active = true);

drop policy if exists artist_events_public_read on public.artist_events;
create policy artist_events_public_read on public.artist_events
  for select using (active = true);

-- Writes to artists + events happen via admin service role (bypasses RLS)

-- Following: fans manage only their own rows
drop policy if exists fan_artist_following_select_own on public.fan_artist_following;
create policy fan_artist_following_select_own on public.fan_artist_following
  for select using (auth.uid() = fan_id);

drop policy if exists fan_artist_following_insert_own on public.fan_artist_following;
create policy fan_artist_following_insert_own on public.fan_artist_following
  for insert with check (auth.uid() = fan_id);

drop policy if exists fan_artist_following_delete_own on public.fan_artist_following;
create policy fan_artist_following_delete_own on public.fan_artist_following
  for delete using (auth.uid() = fan_id);

-- ─── Smoke-test queries ────────────────────────────────────────────────────
-- select slug, name, sort_order from artists order by sort_order;
-- select artist_slug, title from artist_events order by artist_slug, sort_order;
