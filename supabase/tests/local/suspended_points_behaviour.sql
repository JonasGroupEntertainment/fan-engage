-- Behaviour test for migration 0115. Prints one PASS or FAIL line per rule.
create temp table results (name text, ok boolean);
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  r integer;
begin
  r := apply_points_award(a, 25, 'daily_checkin', 'a:1', 'raelynn', null);
  insert into results values ('active fan earns points', r = 25);

  r := apply_points_award(b, 25, 'daily_checkin', 'b:1', 'raelynn', null);
  insert into results values ('suspended fan: check-in pays nothing', r = 0);
  insert into results values ('suspended fan: nothing is written',
    not exists (select 1 from points_ledger where fan_id = b));

  r := apply_points_award(b, 500, 'badge', 'b:2', 'raelynn', null);
  insert into results values ('suspended fan: badge pays nothing', r = 0);
  r := apply_points_award(b, 10, 'challenge', null, null, null);
  insert into results values ('suspended fan: no community, no ref, still nothing', r = 0);
  r := apply_points_award(b, 10, 'not_a_real_source', 'b:3', 'raelynn', null);
  insert into results values ('suspended fan: an unknown source counts as a team adjustment', r = 10);

  r := apply_points_award(b, 100, 'reward_redemption', 'b:refund', 'raelynn', 'Refund');
  insert into results values ('suspended fan: a refund still goes through', r = 100);
  r := apply_points_award(b, 40, 'manual_adjustment', 'b:adj', 'raelynn', 'Team');
  insert into results values ('suspended fan: a team adjustment still goes through', r = 40);
  r := apply_points_award(b, -30, 'manual_adjustment', 'b:take', 'raelynn', 'Take back');
  insert into results values ('suspended fan: points can still be taken away', r = -30);
  insert into results values ('suspended fan: total follows the ledger',
    (select total_points from fans where id = b) = 120);

  update fans set suspended = false where id = b;
  r := apply_points_award(b, 25, 'daily_checkin', 'b:1', 'raelynn', null);
  insert into results values ('after the suspension is lifted the fan earns again', r = 25);

  r := apply_points_award(a, 25, 'daily_checkin', 'a:1', 'raelynn', null);
  insert into results values ('a repeat award is still refused', r = 0);
  r := apply_points_award(a, 0, 'daily_checkin', 'a:0', 'raelynn', null);
  insert into results values ('a zero award is still nothing', r = 0);
end $$;
select case when ok then 'PASS ' else 'FAIL ' end || name from results;
select 'TOTAL ' || count(*) || ' pass ' || count(*) filter (where ok) || ' fail ' || count(*) filter (where not ok) from results;
set role authenticated;
do $$ begin
  perform apply_points_award('00000000-0000-0000-0000-00000000000a', 5, 'badge', 'x', null, null);
  raise notice 'FAIL a signed-in session could call the function';
exception when insufficient_privilege then
  raise notice 'PASS a signed-in session cannot call the function';
end $$;
reset role;
