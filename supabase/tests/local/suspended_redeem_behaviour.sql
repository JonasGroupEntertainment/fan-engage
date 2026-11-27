-- Behaviour test for migration 0116. Prints one PASS or FAIL line per rule.
create temp table results (name text, ok boolean);
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  rw constant uuid := '00000000-0000-0000-0000-0000000000e1';
  rid uuid; msg text;
begin
  perform set_config('test.role', 'authenticated', false);

  perform set_config('test.uid', b::text, false);
  begin
    rid := redeem_reward(b, rw, null, null);
    insert into results values ('suspended fan is refused', false);
  exception when others then
    get stacked diagnostics msg = message_text;
    insert into results values ('suspended fan is refused', msg = 'Account suspended: rewards cannot be redeemed');
  end;
  insert into results values ('suspended fan: no redemption written',
    not exists (select 1 from reward_redemptions where fan_id = b));
  insert into results values ('suspended fan: no points spent',
    fan_ledger_balance(b) = 500);
  insert into results values ('suspended fan: stock untouched',
    (select stock from rewards_catalog where id = rw) = 5);

  perform set_config('test.role', 'service_role', false);
  begin
    rid := redeem_reward(b, rw, null, null);
    insert into results values ('suspended fan is refused for the server too', false);
  exception when others then
    get stacked diagnostics msg = message_text;
    insert into results values ('suspended fan is refused for the server too', msg like 'Account suspended%');
  end;

  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', a::text, false);
  rid := redeem_reward(a, rw, 'note', null);
  insert into results values ('active fan can redeem', rid is not null);
  insert into results values ('active fan: points spent and stock down by one',
    fan_ledger_balance(a) = 400 and (select stock from rewards_catalog where id = rw) = 4);

  begin
    rid := redeem_reward(b, rw, null, null);
    insert into results values ('one fan still cannot redeem as another', false);
  exception when others then
    get stacked diagnostics msg = message_text;
    insert into results values ('one fan still cannot redeem as another', msg like 'Not authorized%');
  end;

  update fans set suspended = false where id = b;
  perform set_config('test.uid', b::text, false);
  rid := redeem_reward(b, rw, null, null);
  insert into results values ('after the suspension is lifted the fan can redeem', rid is not null and fan_ledger_balance(b) = 400);
end $$;
select case when ok then 'PASS ' else 'FAIL ' end || name from results;
select 'TOTAL ' || count(*) || ' pass ' || count(*) filter (where ok) || ' fail ' || count(*) filter (where not ok) from results;
