-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Extend the launch calendar to both hubs (additive column + rows)
alter table public.network_launch_plan add column if not exists platform text not null default 'fan_engage'
  check (platform in ('fan_engage','brand_engage'));

insert into public.network_launch_plan (artist_slug, launch_window, platform, notes) values
  ('nellies',     'soon', 'brand_engage', 'Nellie''s Southern Kitchen — Brand Engage Pro launch'),
  ('jonas-group', 'soon', 'brand_engage', 'Jonas Group — Brand Engage Pro launch')
on conflict (artist_slug) do nothing;

insert into public.network_actions (action_type, ring, artist_slug, payload, reason, proposed_by, dedupe_key)
select 'moment.launch', 'gated', artist_slug,
       jsonb_build_object('launch_window', launch_window, 'platform', platform),
       'Brand Engage Pro launch planned (' || launch_window || ') — draft the launch kit: member announcement, first specials lineup, cross-hub perk for Fan Engage members',
       'concierge', 'launch:' || artist_slug
from public.network_launch_plan where platform = 'brand_engage'
on conflict (dedupe_key) do nothing;
