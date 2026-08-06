-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references public.fans(id) on delete cascade,
  artist_slug text not null,
  points_awarded int not null default 25,
  created_at timestamptz not null default now()
);

create unique index if not exists checkins_fan_artist_day_idx
  on public.checkins (fan_id, artist_slug, date_trunc('day', created_at at time zone 'America/New_York'));

create index if not exists checkins_artist_recent_idx
  on public.checkins (artist_slug, created_at desc);

alter table public.checkins enable row level security;

drop policy if exists "Fans can read own checkins" on public.checkins;
create policy "Fans can read own checkins" on public.checkins
  for select using (auth.uid() = fan_id);
