-- ============================================================================
-- 0043_fan_display_names.sql — expose fan first names for community feeds
-- ============================================================================
-- Punch list #7 (second half): the fans table's only select policy is
-- fans_self_select (auth.uid() = id), so the community feed's
-- `from("fans").select("id, first_name").in("id", authorIds)` returns rows
-- ONLY for the viewer themselves — every other author renders as
-- "Anonymous fan", and logged-out viewers see no names at all.
--
-- Rather than opening row-level read on fans (which would expose email and
-- other private columns through the API), this security-definer function
-- returns exactly two fields: id + first_name. The app calls it via RPC.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

create or replace function public.get_fan_display_names(p_ids uuid[])
returns table (id uuid, first_name text)
language sql
security definer
stable
set search_path = public
as $$
  select f.id, f.first_name
  from public.fans f
  where f.id = any(p_ids);
$$;

comment on function public.get_fan_display_names is
  'Returns only id + first_name for the given fan ids. Security definer so community feeds can show author names without opening row-level read on the fans table.';

grant execute on function public.get_fan_display_names(uuid[]) to anon, authenticated, service_role;
