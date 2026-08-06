-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Fan Engage Pro launch calendar (additive). The daily pulse reads this,
-- so every morning brief counts down to upcoming launches.
create table if not exists public.network_launch_plan (
  artist_slug text primary key,
  launch_window text not null,
  target_date date,
  status text not null default 'planned' check (status in ('planned','launched','postponed')),
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.network_launch_plan enable row level security;

insert into public.network_launch_plan (artist_slug, launch_window, target_date, notes) values
  ('raelynn',        'next week',  current_date + 7, 'First Fan Engage Pro artist launch; site feeder already live'),
  ('dan-marshall',   'soon after RaeLynn', null, 'Second wave'),
  ('franklin-jonas', 'soon after RaeLynn', null, 'Second wave; static site — newsletter feeder to be added at launch'),
  ('hunter-hawkins', 'soon',       null, 'Following wave')
on conflict (artist_slug) do nothing;

-- Launch moments: gated proposals so the Worker drafts each launch kit
insert into public.network_actions (action_type, ring, artist_slug, payload, reason, proposed_by, dedupe_key)
select 'moment.launch', 'gated', artist_slug,
       jsonb_build_object('launch_window', launch_window, 'target_date', target_date),
       'Fan Engage Pro launch planned (' || launch_window || ') — draft the launch kit: announcement copy, day-one cohort framing, welcome quest, first-week ritual',
       'concierge',
       'launch:' || artist_slug
from public.network_launch_plan
on conflict (dedupe_key) do nothing;
