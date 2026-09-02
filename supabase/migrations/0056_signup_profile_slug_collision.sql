-- ============================================================================
-- 0056_signup_profile_slug_collision.sql
-- ============================================================================
-- P0: password signup aborted with GoTrue "Database error saving new user"
-- when the fans BEFORE INSERT trigger assigned profile_slug = 'fan-' ||
-- first 4 hex chars of the new UUID and that slug was already taken.
--
-- Evidence (www, 2026-09-02 08:55:23Z, fewalk902h-class walk):
--   POST /signup 500 unexpected_failure
--   ERROR: duplicate key value violates unique constraint
--          "fans_profile_slug_unique" (SQLSTATE 23505)
-- Auth insert + fan row rolled back; the next unique email (fewalk902i)
-- succeeded because its UUID prefix was free.
--
-- 1,561 of 1,566 fans already use fan-[0-9a-f]{4} (65,536 slots) → ~2.4%
-- of new signups collide. The trigger never retried.
--
-- Fix: keep the short fan-XXXX when it is free; otherwise lengthen using
-- more of the UUID. Does not touch founding-fan / 0055.
-- ============================================================================

create or replace function public.set_default_fan_profile_slug()
returns trigger
language plpgsql
as $func$
declare
  v_base text;
  v_idhex text;
  v_len int;
  v_slug text;
begin
  if new.profile_slug is not null then
    return new;
  end if;

  v_base := lower(
    coalesce(
      nullif(regexp_replace(coalesce(new.first_name, ''), '[^a-zA-Z0-9]', '', 'g'), ''),
      'fan'
    )
  );
  v_idhex := replace(new.id::text, '-', '');

  foreach v_len in array array[4, 8, 12, 32]
  loop
    v_slug := v_base || '-' || substring(v_idhex, 1, v_len);
    if not exists (
      select 1 from public.fans where lower(profile_slug) = v_slug
    ) then
      new.profile_slug := v_slug;
      return new;
    end if;
  end loop;

  -- Last resort if every prefix is somehow taken.
  new.profile_slug := v_base || '-' || v_idhex || '-' ||
    extract(epoch from clock_timestamp())::bigint::text;
  return new;
end;
$func$;
