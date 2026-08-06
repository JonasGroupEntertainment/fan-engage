-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

create table public.stamp_card_configs (
  artist_slug text primary key,
  stamps_required int not null default 5,
  reward_title text not null default 'Free item',
  reward_description text,
  active bool not null default true,
  created_at timestamptz not null default now()
);

alter table public.stamp_card_configs enable row level security;

create policy "Anyone can read active stamp configs" on public.stamp_card_configs for select using (active = true);
