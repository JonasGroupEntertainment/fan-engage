-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Hardening: trigger functions never need to be callable via the API
revoke execute on function public.network_publish_internal() from public, anon, authenticated;
revoke execute on function public.network_register_new_fan() from public, anon, authenticated;
