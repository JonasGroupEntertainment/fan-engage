-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

create table if not exists public.copilot_briefs (
  id uuid primary key default gen_random_uuid(),
  community_id text not null,
  payload jsonb not null,
  model text,
  prompt_version text,
  generated_at timestamptz not null default now()
);
create index if not exists copilot_briefs_community_idx
  on public.copilot_briefs (community_id, generated_at desc);
alter table public.copilot_briefs enable row level security;
-- server-only (admin client); no anon policies on purpose
