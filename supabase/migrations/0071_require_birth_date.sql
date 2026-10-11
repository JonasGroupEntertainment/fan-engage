-- Applied to production 2026-10-11 (ledger version 20261011160557).
--
-- 0071_require_birth_date.sql
--
-- Makes a date of birth required to create a Fan Engage account. 0070 let
-- sign-ups with no birth date through so older browser tabs kept working.
-- PR #98 (the form that sends a birth date) is live, so the gap closes now.
--
-- After this, handle_new_auth_user() refuses to create an account when the
-- signup carries no valid birth date. The one exception is the admin CSV
-- fan import, which marks the auth user with app_metadata.fan_import = true.
-- app_metadata can only be written with the service role, so a sign-up from
-- a browser or a direct API call cannot use the exception.
--
-- Side effects, all intended:
--   * The login page's magic link no longer creates accounts. The app now
--     asks Supabase not to create one (shouldCreateUser: false).
--   * "Add user" or "Invite" in the Supabase dashboard fails for this
--     project. Use the admin fan import instead.
--
-- Existing fans are not touched. Nobody is deleted by this script.
--
-- One statement, safe to paste whole into the Supabase SQL editor.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg

-- Statement 1: signup trigger. Same as 0070 plus the birth date rule.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  phone_text text := nullif(btrim(coalesce(meta->>'phone', '')), '');
  sms_flag boolean := false;
  dob date := public.parse_birth_date(meta->>'birth_date');
  age_years integer := public.fan_age_years(dob);
begin
  -- Future or impossible dates are treated as missing.
  if age_years is not null and (age_years < 0 or age_years > 120) then
    dob := null;
    age_years := null;
  end if;

  if age_years is not null and age_years < 13 then
    raise exception 'signup_not_allowed' using errcode = 'P0001';
  end if;

  -- New in 0071: a birth date is required. Only the admin fan import may
  -- create an account without one. app_metadata can only be set with the
  -- service role, so a public sign-up cannot claim the exemption.
  if dob is null
     and coalesce(new.raw_app_meta_data->>'fan_import', '') <> 'true' then
    raise exception 'birth_date_required' using errcode = 'P0001';
  end if;

  if phone_text is null or phone_text !~ '^\+[1-9][0-9]{7,14}$' then
    phone_text := null;
  elsif meta->>'sms_opted_in' = 'true' and age_years is not null and age_years >= 18 then
    sms_flag := true;
  end if;

  insert into public.fans (id, email, phone, sms_opted_in, birth_date)
  values (new.id, new.email, phone_text, sms_flag, dob)
  on conflict (id) do nothing;
  return new;
end;
$function$;
