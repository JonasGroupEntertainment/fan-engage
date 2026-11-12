-- ────────────────────────────────────────────────────────────────────────────
-- 0095 — superfan_thanks (Sprint 4 item B: team ease)
--
-- One row each time an artist's team marks a fan "thanked" from
-- /artist-portal/superfans. The pure selector lib/superfans/to-thank.ts
-- reads thanked_at to keep a fan off the "superfans to thank" list (portal
-- page + Monday team brief) for 60 days after a thank-you.
--
-- Access:
--   service_role     everything (the cron and the portal server action)
--   authenticated    select / insert only for communities the caller
--                    administers (is_admin_of, 0011 — super-admin '*' rows
--                    qualify). No client update or delete: a thank-you is
--                    a fact, not a setting; fix mistakes with the service
--                    role.
--
-- Idempotent: create table if not exists, index if not exists, policies
-- drop-then-create. Nothing is dropped but the policies being replaced.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.superfan_thanks (
  community_id  text not null references public.communities(slug) on delete cascade,
  fan_id        uuid not null references public.fans(id) on delete cascade,
  thanked_by    uuid references public.fans(id) on delete set null,
  thanked_at    timestamptz not null default now(),
  note          text,
  primary key (community_id, fan_id, thanked_at)
);

comment on table public.superfan_thanks is
  'Artist-team thank-you log; a fan stays off the superfans-to-thank list for 60 days after thanked_at (lib/superfans/to-thank.ts).';

create index if not exists superfan_thanks_fan_idx
  on public.superfan_thanks (fan_id, thanked_at desc);

alter table public.superfan_thanks enable row level security;

drop policy if exists superfan_thanks_service_all on public.superfan_thanks;
create policy superfan_thanks_service_all on public.superfan_thanks
  for all to service_role using (true) with check (true);

drop policy if exists superfan_thanks_admin_read on public.superfan_thanks;
create policy superfan_thanks_admin_read on public.superfan_thanks
  for select to authenticated using (public.is_admin_of(community_id));

drop policy if exists superfan_thanks_admin_insert on public.superfan_thanks;
create policy superfan_thanks_admin_insert on public.superfan_thanks
  for insert to authenticated with check (public.is_admin_of(community_id));

grant select, insert on public.superfan_thanks to authenticated;

grant all on public.superfan_thanks to service_role;

-- ─── Verify (SQL editor) ───────────────────────────────────────────────────
-- select policyname, cmd, roles from pg_policies where tablename = 'superfan_thanks';
-- -- Expected: superfan_thanks_service_all (ALL, service_role),
-- --           superfan_thanks_admin_read (SELECT, authenticated),
-- --           superfan_thanks_admin_insert (INSERT, authenticated)
