-- Parent or guardian OK for fans ages 13–17.
--
-- Under 13 is still refused. Adults do not need this checkbox.
-- The OK is a self-declared checkbox stored as a timestamp. It is not
-- verified: no parent email, no confirmation link.
-- Imported fans (raw_app_meta_data fan_import = true) are not asked.
--
-- No new table. fans already has its grants; this only adds a column.
-- Do not apply from the draft PR.
-- Numbered 0098. Open PR #143 uses 0096. Main already has 0097.
-- If pasting into the SQL editor, run one statement at a time.

alter table public.fans
  add column if not exists parent_consent_at timestamptz;

comment on column public.fans.parent_consent_at is
  'When a 13–17 fan ticked that a parent or guardian said they can join. Null for adults, under-13 refusals, and imports. Not verified.';

-- Same signup trigger as 0077, plus the parent-OK requirement.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to public
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  phone_text text := nullif(btrim(coalesce(meta->>'phone', '')), '');
  sms_flag boolean := false;
  dob date := public.parse_birth_date(meta->>'birth_date');
  age_years integer := public.fan_age_years(dob);
  parent_ok boolean := meta->>'parent_consent' = 'true';
  parent_at timestamptz := null;
  is_import boolean := coalesce(new.raw_app_meta_data->>'fan_import', '') = 'true';
begin
  if age_years is not null and (age_years < 0 or age_years > 120) then
    dob := null;
    age_years := null;
  end if;

  if age_years is not null and age_years < 13 then
    raise exception 'signup_not_allowed' using errcode = 'P0001';
  end if;

  if age_years is not null and age_years >= 13 and age_years < 18 and not is_import then
    if not parent_ok then
      raise exception 'parent_consent_required' using errcode = 'P0001';
    end if;
    parent_at := now();
  end if;

  if dob is null and not is_import then
    raise exception 'birth_date_required' using errcode = 'P0001';
  end if;

  if phone_text is null or phone_text !~ '^\+[1-9][0-9]{7,14}$' then
    phone_text := null;
  elsif meta->>'sms_opted_in' = 'true' and age_years is not null and age_years >= 18 then
    sms_flag := true;
  end if;

  insert into public.fans (
    id, email, phone, sms_opted_in, birth_date, is_internal, parent_consent_at
  )
  values (
    new.id,
    new.email,
    phone_text,
    sms_flag,
    dob,
    public.fan_email_is_internal(new.email),
    parent_at
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
