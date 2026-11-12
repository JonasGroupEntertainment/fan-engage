-- 0090: real event + fan locations for "Near you" distance on Fan Home and
-- the artist hub (Sprint 3 item B of the 2026-10-29 audit).
--
-- Before this, artist_events carried only the free-text `location` and fans
-- only `city` (text). Distance needs coordinates on both sides. No PostGIS:
-- plain double precision lat/lng, resolved server-side from the bundled US
-- city table (frontend/lib/geo/us-cities.ts) when an admin or fan saves a
-- city + state, and computed with a haversine in lib/geo/haversine.ts.
--
-- Idempotent: every statement is ADD COLUMN IF NOT EXISTS. Each statement is
-- separate so the Supabase SQL editor can run them one at a time.

alter table public.artist_events add column if not exists city text;
alter table public.artist_events add column if not exists region text;
alter table public.artist_events add column if not exists lat double precision;
alter table public.artist_events add column if not exists lng double precision;

comment on column public.artist_events.city is
  'Venue city, used with region to resolve lat/lng. Free-text `location` stays the display string.';
comment on column public.artist_events.region is
  'Venue state/province code (TX, TN, ON). Pairs with city for coordinate lookup.';
comment on column public.artist_events.lat is
  'Venue latitude (WGS84). Null when the city could not be resolved; the admin form says so.';
comment on column public.artist_events.lng is
  'Venue longitude (WGS84). Null when the city could not be resolved.';

-- fans.city already exists and stays the display city.
alter table public.fans add column if not exists home_region text;
alter table public.fans add column if not exists home_lat double precision;
alter table public.fans add column if not exists home_lng double precision;

comment on column public.fans.home_region is
  'Home state/province code the fan entered on /me/profile. Pairs with fans.city.';
comment on column public.fans.home_lat is
  'Home latitude resolved from city + home_region. Null until the fan saves a resolvable city.';
comment on column public.fans.home_lng is
  'Home longitude resolved from city + home_region.';
