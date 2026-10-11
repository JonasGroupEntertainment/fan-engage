-- Applied to production 2026-10-11 (ledger version 20261011154001).
--
-- 0070_age_check.sql
--
-- COPPA age check. The signup form asks for a date of birth and stops
-- under-13s in the browser before anything is sent. This migration is the
-- backstop in the database:
--
--   1. fans.birth_date stores the self-declared date of birth.
--   2. handle_new_auth_user() refuses to create an account when the signup
--      metadata carries a birth date under 13. The exception rolls back
--      the whole auth.users insert, so nothing about that person is kept.
--      It also keeps SMS off for anyone under 18.
--   3. A fans trigger makes birth_date set-once (null to a value, never
--      changed after), refuses an under-13 value, turns SMS opt-in off
--      for a known under-18 fan, and stops a fan's own browser from
--      turning SMS on without a known adult birth date.
--
-- Existing fans are left alone. Fans with no birth date keep their current
-- SMS setting (grandfathered). The app asks them for a birth date before
-- a new SMS opt-in or a paid checkout. Nobody is deleted by this script.
-- Signups that send no birth date (older clients) still work.
--
-- If pasting into the Supabase SQL editor, run one statement at a time.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg

-- Statement 1: birth date column.
alter table public.fans
  add column if not exists birth_date date;

comment on column public.fans.birth_date is
  'Self-declared date of birth. Set once at signup (or later if missing), never changed by the fan. Under-13 values are refused. Under 18 means no paid tiers and no SMS.';

-- Statement 2: helpers. Whole years between a date of birth and today (UTC).
create or replace function public.fan_age_years(dob date)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select case
    when dob is null then null
    else extract(year from age((now() at time zone 'utc')::date, dob))::integer
  end;
$function$;

-- Reads YYYY-MM-DD from text. Returns null for anything else instead of
-- raising, so a bad value never blocks a normal signup.
create or replace function public.parse_birth_date(raw text)
returns date
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  d date;
begin
  if raw is null or raw !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  begin
    d := raw::date;
  exception when others then
    return null;
  end;
  if to_char(d, 'YYYY-MM-DD') <> raw then
    return null;
  end if;
  return d;
end;
$function$;

-- Statement 3: signup trigger. Same as 0068 plus the age rules.
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

-- Statement 4: fans rules for every writer (app, settings, Twilio, admin).
create or replace function public.fans_enforce_age_rules()
returns trigger
language plpgsql
set search_path to 'public'
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

  -- Known under-18: no SMS. Unknown birth date keeps the current setting.
  if age_years is not null and age_years < 18 then
    new.sms_opted_in := false;
  end if;

  -- A fan writing their own row (signed-in browser, not the server) cannot
  -- turn SMS on without a known adult birth date. Server code applies the
  -- same rule in the app; Twilio START is a server re-subscribe.
  if current_user = 'authenticated'
     and new.sms_opted_in is true
     and (tg_op = 'INSERT' or old.sms_opted_in is distinct from true)
     and (age_years is null or age_years < 18) then
    new.sms_opted_in := false;
  end if;

  return new;
end;
$function$;

-- Runs before fans_set_channel_opt_in_timestamps (triggers fire in name
-- order), so a forced-off SMS flag never gets a fresh opt-in timestamp.
drop trigger if exists fans_enforce_age_rules on public.fans;
create trigger fans_enforce_age_rules
  before insert or update on public.fans
  for each row execute function public.fans_enforce_age_rules();
