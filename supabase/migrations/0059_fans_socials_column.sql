-- ────────────────────────────────────────────────────────────────────────────
-- Fan Engage — fans.socials repo record
--
-- fans.socials (jsonb, not null, default '{}') already exists in production
-- and is read/written by the onboard route, the admin fan import, the public
-- fan profile page, and (as of this PR) the /me/profile edit form. It was
-- added out of band and never recorded in this folder. This migration is a
-- no-op against production and exists so the repo matches the live schema.
--
-- Already applied to production via MCP on 2026-09-17; kept here for the
-- repo record.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.fans
  add column if not exists socials jsonb not null default '{}'::jsonb;

comment on column public.fans.socials is
  'Fan social handles keyed by platform, e.g. {"instagram_or_tiktok": "@handle"}. Merge on write, never overwrite.';
