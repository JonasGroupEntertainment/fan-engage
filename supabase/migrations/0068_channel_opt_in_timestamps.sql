-- Not yet applied to production.
--
-- 0068_channel_opt_in_timestamps.sql
--
-- Stores the time a fan's SMS or email consent last flipped from false to
-- true. The existing fans.sms_opted_in and fans.email_opted_in flags stay.
--
-- Opt-out leaves the timestamp in place. It is the last time the fan gave
-- consent, same idea as fans.consent_accepted_at, which unsubscribe does
-- not erase. A later opt-in (false → true) writes a new timestamp. Fans
-- who were already opted in before this migration keep a null timestamp
-- until that next transition — this script does not invent a past time.
--
-- The fans trigger covers every writer (onboarding, settings, unsubscribe,
-- Twilio STOP/START). Application code sets the same columns when it
-- knows the transition; the trigger fills them in when a writer only
-- flips the boolean, and it keeps an explicit timestamp the app already
-- set. Idempotent.
--
-- handle_new_auth_user() also copies an optional E.164 phone and SMS
-- consent from auth user metadata collected on the public signup form.
-- The checkbox is stored only when a valid phone is present. Invalid
-- metadata never blocks account creation.
--
-- If pasting into the Supabase SQL editor, run one statement at a time.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg

-- Statement 1 — timestamp columns.
alter table public.fans
  add column if not exists sms_opted_in_at timestamptz,
  add column if not exists email_opted_in_at timestamptz;

-- Statement 2 — column comments (opt-out semantics).
comment on column public.fans.sms_opted_in_at is
  'Last time sms_opted_in flipped from false to true. Left in place on opt-out. Null if the fan has never opted in since this column existed.';

comment on column public.fans.email_opted_in_at is
  'Last time email_opted_in flipped from false to true. Left in place on opt-out. Null if the fan has never opted in since this column existed.';

-- Statement 3 — keep timestamps aligned with the boolean flags.
create or replace function public.fans_set_channel_opt_in_timestamps()
returns trigger
language plpgsql
as $function$
begin
  -- SMS: set on insert-as-true, or on a false → true update.
  -- If the row already carries a new explicit timestamp, keep it.
  -- Opt-out does not clear sms_opted_in_at.
  if new.sms_opted_in is true
     and (tg_op = 'INSERT' or old.sms_opted_in is distinct from true) then
    if tg_op = 'INSERT' then
      new.sms_opted_in_at := coalesce(new.sms_opted_in_at, now());
    elsif new.sms_opted_in_at is not distinct from old.sms_opted_in_at then
      new.sms_opted_in_at := now();
    end if;
  end if;

  -- Email: same rule. Opt-out does not clear email_opted_in_at.
  if new.email_opted_in is true
     and (tg_op = 'INSERT' or old.email_opted_in is distinct from true) then
    if tg_op = 'INSERT' then
      new.email_opted_in_at := coalesce(new.email_opted_in_at, now());
    elsif new.email_opted_in_at is not distinct from old.email_opted_in_at then
      new.email_opted_in_at := now();
    end if;
  end if;

  return new;
end;
$function$;

-- Statement 4 — trigger.
drop trigger if exists fans_set_channel_opt_in_timestamps on public.fans;
create trigger fans_set_channel_opt_in_timestamps
  before insert or update on public.fans
  for each row execute function public.fans_set_channel_opt_in_timestamps();

-- Statement 5 — signup metadata (phone + SMS) onto the new fan row.
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
begin
  if phone_text is null or phone_text !~ '^\+[1-9][0-9]{7,14}$' then
    phone_text := null;
  elsif meta->>'sms_opted_in' = 'true' then
    sms_flag := true;
  end if;

  insert into public.fans (id, email, phone, sms_opted_in)
  values (new.id, new.email, phone_text, sms_flag)
  on conflict (id) do nothing;
  return new;
end;
$function$;
