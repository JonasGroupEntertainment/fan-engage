-- Hide staff and internal test accounts from the public Founding Fan
-- roster WITHOUT deleting accounts, badges, or founding_fan_number.
--
-- DO NOT put this file in supabase/migrations. It is not applied on deploy.
-- Run it by hand in the Supabase SQL editor after reviewing the preview.
-- The editor silently drops every statement after the first in a paste.
-- Run PREVIEW, read the rows, then run APPLY as its own paste.
--
-- Reversible: run REVERSE as its own paste. Also remove the fan id from
-- frontend/lib/founding-internal-fans.ts and from the v_hidden array in
-- 0071_internal_founding_fan_flag.sql, or the public wall and claim cap
-- will keep excluding them.
--
-- Not in this list, left public on purpose pending owner confirmation:
--   Founding Fan #8  (no display name)  d658254b-0f1f-47b1-8bff-d9f2d5ffc817
--   Founding Fan #12 (no display name)  b393a127-6b96-4d48-8aa3-5ffc8f8cbffd
--   Morgan wallen #15                   c52e1b95-8399-4379-a4ea-fef1ef1153db

-- ─── PREVIEW (run this statement alone first) ────────────────────────────
select
  m.founding_fan_number,
  f.id,
  f.first_name,
  f.is_internal
from public.fans f
join public.fan_community_memberships m
  on m.fan_id = f.id
 and m.community_id = 'raelynn'
where f.id in (
  'bf02e0cf-b740-407a-9436-222becfc3c49',
  '64aa29d4-a0fc-4653-ae5b-06586c0067a7',
  '84996598-c71a-42a8-812c-a2e3ea642de8',
  '1922bd3c-becc-4cac-afb8-ceeba8666bb4',
  'f198e0e2-5d69-489b-9736-26adf1a690ca',
  'f4c5819f-b340-4b7d-82c9-c5fff973eeb2',
  '094fd522-a559-472b-aab0-1aa49bba8aab',
  '234f4222-fe96-46e2-b403-9ca5fe3ac905',
  '44038dc7-7fb4-431c-86a3-02553a534c35',
  '4b83c23e-775b-455f-b792-e31601e85e5b',
  'e2e3d3ef-824a-4951-8cdc-70ed574c6544'
)
order by m.founding_fan_number;

-- ─── APPLY (run alone, after the preview looks right) ────────────────────
-- update public.fans
-- set is_internal = true
-- where id in (
--   'bf02e0cf-b740-407a-9436-222becfc3c49',
--   '64aa29d4-a0fc-4653-ae5b-06586c0067a7',
--   '84996598-c71a-42a8-812c-a2e3ea642de8',
--   '1922bd3c-becc-4cac-afb8-ceeba8666bb4',
--   'f198e0e2-5d69-489b-9736-26adf1a690ca',
--   'f4c5819f-b340-4b7d-82c9-c5fff973eeb2',
--   '094fd522-a559-472b-aab0-1aa49bba8aab',
--   '234f4222-fe96-46e2-b403-9ca5fe3ac905',
--   '44038dc7-7fb4-431c-86a3-02553a534c35',
--   '4b83c23e-775b-455f-b792-e31601e85e5b',
--   'e2e3d3ef-824a-4951-8cdc-70ed574c6544'
-- );

-- ─── REVERSE (run alone only to undo APPLY) ──────────────────────────────
-- update public.fans
-- set is_internal = false
-- where id in (
--   'bf02e0cf-b740-407a-9436-222becfc3c49',
--   '64aa29d4-a0fc-4653-ae5b-06586c0067a7',
--   '84996598-c71a-42a8-812c-a2e3ea642de8',
--   '1922bd3c-becc-4cac-afb8-ceeba8666bb4',
--   'f198e0e2-5d69-489b-9736-26adf1a690ca',
--   'f4c5819f-b340-4b7d-82c9-c5fff973eeb2',
--   '094fd522-a559-472b-aab0-1aa49bba8aab',
--   '234f4222-fe96-46e2-b403-9ca5fe3ac905',
--   '44038dc7-7fb4-431c-86a3-02553a534c35',
--   '4b83c23e-775b-455f-b792-e31601e85e5b',
--   'e2e3d3ef-824a-4951-8cdc-70ed574c6544'
-- );
