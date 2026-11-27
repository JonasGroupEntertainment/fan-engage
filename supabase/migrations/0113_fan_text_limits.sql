-- 0113_fan_text_limits.sql
--
-- Not yet applied to production.
--
-- Length limits on the text a fan can save about themselves, as a
-- backstop for every writer. Port of Brand Engage Pro 0127.
--   fans: first_name 50, last_name 50, city 80, handle 30, interest 120,
--     music_outlet 80, phone 20, socials 2,000 characters as stored JSON.
--   reward_redemptions.delivery_details 500.
--   community_challenge_entries.body 1,000.
--
-- The longest values in production on 2026-11-27 were: first_name 18,
-- city 54, interest 59, music_outlet 23, phone 17, socials 47,
-- delivery_details 20, challenge entry 62 (no last_name or handle is
-- stored). Every row passes, so the constraints validate immediately.
--
-- Each constraint is added only when its column exists. Safely
-- re-runnable. Rollback: drop the constraints named *_length below.

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('fans',                        'first_name',       'fans_first_name_length',                     'char_length(first_name) <= 50'),
      ('fans',                        'last_name',        'fans_last_name_length',                      'char_length(last_name) <= 50'),
      ('fans',                        'city',             'fans_city_length',                           'char_length(city) <= 80'),
      ('fans',                        'handle',           'fans_handle_length',                         'char_length(handle) <= 30'),
      ('fans',                        'interest',         'fans_interest_length',                       'char_length(interest) <= 120'),
      ('fans',                        'music_outlet',     'fans_music_outlet_length',                   'char_length(music_outlet) <= 80'),
      ('fans',                        'phone',            'fans_phone_length',                          'char_length(phone) <= 20'),
      ('fans',                        'socials',          'fans_socials_length',                        'char_length(socials::text) <= 2000'),
      ('reward_redemptions',          'delivery_details', 'reward_redemptions_delivery_details_length', 'char_length(delivery_details) <= 500'),
      ('community_challenge_entries', 'body',             'community_challenge_entries_body_length',    'char_length(body) <= 1000')
    ) as t(tbl, col, con, expr)
  loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = spec.tbl and column_name = spec.col
    ) then
      execute format('alter table public.%I drop constraint if exists %I', spec.tbl, spec.con);
      execute format('alter table public.%I add constraint %I check (%I is null or %s)',
                     spec.tbl, spec.con, spec.col, spec.expr);
    end if;
  end loop;
end $$;
