-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Storage for the autonomous Network Narrator's daily briefs (additive)
create table if not exists public.network_briefs (
  brief_date date primary key,
  metrics    jsonb not null default '{}'::jsonb,
  summary    text not null,
  created_at timestamptz not null default now()
);
alter table public.network_briefs enable row level security;
