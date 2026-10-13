-- Tag staff and internal mail as fans.is_internal.
--
-- Domains: jonasgroup.com, grokbot.com, agentmail.to.
-- Extra staff addresses live in frontend/lib/internal-accounts.ts and
-- are repeated in fan_email_is_internal() below. Keep the two lists
-- the same.
--
-- New signups are tagged by handle_new_auth_user() (same rules as
-- 0071, plus is_internal). Existing matching rows are backfilled.
-- No fan row is deleted. Test rows that do not match stay as they are.
--
-- Apply by hand in the Supabase SQL editor, one statement at a time,
-- in order. Fan Engage Supabase project: uhovonrljcauaoctypbg

create or replace function public.fan_email_is_internal(p_email text)
returns boolean
language sql
immutable
as $$
  select
    lower(split_part(btrim(coalesce(p_email, '')), '@', 2)) in (
      'jonasgroup.com',
      'grokbot.com',
      'agentmail.to'
    )
    or lower(btrim(coalesce(p_email, ''))) in (
      'kevinjonassr@gmail.com',
      'hanaproductmanager@gmail.com',
      'syncnatra@gmail.com'
    );
$$;

revoke all on function public.fan_email_is_internal(text) from public, anon, authenticated;

comment on function public.fan_email_is_internal(text) is
  'True for jonasgroup.com, grokbot.com, agentmail.to, and the staff list in frontend/lib/internal-accounts.ts.';

-- Signup trigger. Same as 0071, and sets is_internal from the email.
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
  if age_years is not null and (age_years < 0 or age_years > 120) then
    dob := null;
    age_years := null;
  end if;

  if age_years is not null and age_years < 13 then
    raise exception 'signup_not_allowed' using errcode = 'P0001';
  end if;

  if dob is null
     and coalesce(new.raw_app_meta_data->>'fan_import', '') <> 'true' then
    raise exception 'birth_date_required' using errcode = 'P0001';
  end if;

  if phone_text is null or phone_text !~ '^\+[1-9][0-9]{7,14}$' then
    phone_text := null;
  elsif meta->>'sms_opted_in' = 'true' and age_years is not null and age_years >= 18 then
    sms_flag := true;
  end if;

  insert into public.fans (id, email, phone, sms_opted_in, birth_date, is_internal)
  values (
    new.id,
    new.email,
    phone_text,
    sms_flag,
    dob,
    public.fan_email_is_internal(new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- One-off backfill. Does not delete rows and does not clear is_internal.
update public.fans
   set is_internal = true
 where is_internal = false
   and public.fan_email_is_internal(email::text);
