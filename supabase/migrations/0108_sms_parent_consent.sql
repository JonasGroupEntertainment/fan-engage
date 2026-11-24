-- Separate parent or guardian permission for text alerts, ages 13 to 17.
--
-- Under 13 still cannot join and cannot be texted. Adults opt into texts
-- as before. A fan with no birth date is not blocked from texts.
-- The join tick (parent_consent_at) is not this tick.
--
-- Not applied from the pull request. Do not run this against production
-- from an agent. Kevin applies it by hand, one statement at a time.
-- Until then, fans_enforce_age_rules (0070) still turns texts off for
-- anyone under 18, so a teen opt-in cannot stick.
--
-- Numbered 0108. Main already has 0107_badge_points_own_source.sql.
-- No new table. fans already has its grants; this only adds a column.
-- Idempotent: add column if not exists, create or replace, drop trigger
-- if exists. Nothing is dropped.

alter table public.fans
  add column if not exists sms_parent_consent_at timestamptz;

comment on column public.fans.sms_parent_consent_at is
  'When a fan aged 13 to 17 attested that a parent or guardian said they can get text messages. Separate from parent_consent_at. Null for adults, under-13 refusals, and fans who have not ticked it. Not verified.';

-- Same signup trigger as 0098, plus the text permission.
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
  sms_parent_at timestamptz := null;
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
  elsif meta->>'sms_opted_in' = 'true'
    and age_years is not null
    and age_years >= 13
    and age_years < 18
    and meta->>'sms_parent_consent' = 'true' then
    sms_flag := true;
    sms_parent_at := now();
  elsif meta->>'sms_opted_in' = 'true' and age_years is null then
    sms_flag := true;
  end if;

  insert into public.fans (
    id, email, phone, sms_opted_in, birth_date, is_internal, parent_consent_at, sms_parent_consent_at
  )
  values (
    new.id,
    new.email,
    phone_text,
    sms_flag,
    dob,
    public.fan_email_is_internal(new.email),
    parent_at,
    sms_parent_at
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- Replaces the 0070 rule that turned texts off for every known under-18 fan.
create or replace function public.fans_enforce_age_rules()
returns trigger
language plpgsql
set search_path to public
as $function$
declare
  age_years integer;
begin
  if tg_op = 'UPDATE'
     and old.birth_date is not null
     and new.birth_date is distinct from old.birth_date then
    raise exception 'birth_date_locked' using errcode = 'P0001';
  end if;

  age_years := public.fan_age_years(new.birth_date);
  if age_years is not null and (age_years < 13 or age_years > 120) then
    raise exception 'birth_date_not_allowed' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
     and old.sms_parent_consent_at is not null
     and new.sms_parent_consent_at is distinct from old.sms_parent_consent_at then
    raise exception 'sms_parent_consent_locked' using errcode = 'P0001';
  end if;

  -- A new text opt-in. 18+ and a missing birth date are not blocked.
  -- Ages 13 to 17 need sms_parent_consent_at on this same write.
  -- Under 13 is refused. Turning texts off is always allowed.
  -- An opt-in that was already on stays on.
  if new.sms_opted_in is true
     and (tg_op = 'INSERT' or old.sms_opted_in is distinct from true) then
    if age_years is not null and age_years < 13 then
      raise exception 'sms_not_allowed' using errcode = 'P0001';
    end if;
    if age_years is not null and age_years < 18 and new.sms_parent_consent_at is null then
      raise exception 'sms_parent_consent_required' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.handle_new_auth_user() to service_role;
revoke all on function public.fans_enforce_age_rules() from public, anon, authenticated;
grant execute on function public.fans_enforce_age_rules() to service_role;
