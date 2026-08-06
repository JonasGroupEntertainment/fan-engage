-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Campaign goals per community, replacing hardcoded goals on the artist page.
-- metric determines how "current" is computed at render time:
--   founder_count → live count of founding fans
--   rsvp_total    → sum of RSVPs across the artist's events
--   ledger_count  → count of points_ledger rows where source = metric_ref
--   manual        → manual_current column (admin-updated)
create table if not exists public.community_goals (
  id uuid primary key default gen_random_uuid(),
  community_id text not null,
  emoji text not null default '🎯',
  label text not null,
  target integer not null check (target > 0),
  metric text not null default 'manual'
    check (metric in ('founder_count', 'rsvp_total', 'ledger_count', 'manual')),
  metric_ref text,
  manual_current integer not null default 0,
  link_href text,
  link_label text,
  sort_order integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_goals_community_idx
  on public.community_goals (community_id, active, sort_order);

-- Server-only table (read via service role during page render); no anon policies.
alter table public.community_goals enable row level security;

-- Seed RaeLynn's two existing hardcoded goals so the page renders identically.
insert into public.community_goals
  (community_id, emoji, label, target, metric, link_href, link_label, sort_order)
values
  ('raelynn', '👑', 'Help RaeLynn reach 100 founding fans', 100, 'founder_count',
   '/artists/raelynn/founders', 'See the founding fans →', 0),
  ('raelynn', '🎟', '50 community RSVPs unlock a private Q&A entry', 50, 'rsvp_total',
   null, null, 1);
