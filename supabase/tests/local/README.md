# Local behaviour test for migrations 0110 to 0113

These two files check the community write rules on a throwaway local
Postgres. They never touch production or any Supabase project.

- `hardening_base.sql` builds a small stand-in for the tables, roles,
  policies and functions the migrations depend on.
- `hardening_behaviour.sql` acts as a Premium fan, a free fan, a team
  author and the service role, and prints one PASS or FAIL line per rule.

How to run (any local Postgres 15 or later):

1. Create an empty database and run `hardening_base.sql` in it.
2. Run migrations 0110, 0111, 0112 and 0113 from `supabase/migrations/`.
3. Run `hardening_behaviour.sql`. The last line reads `TOTAL 40 pass 40 fail 0`.

The stand-in is deliberately small. It is not a copy of production, so a
pass here shows the rules behave as written, not that production matches.
