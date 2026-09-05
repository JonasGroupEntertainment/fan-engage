-- Shared authentication rate limits for serverless deployments.
-- Raw client identifiers never enter this table; callers send a salted SHA-256 hash.

create schema if not exists private;

create table if not exists private.auth_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 86400),
  request_count integer not null check (request_count >= 1),
  primary key (scope, identifier_hash),
  constraint auth_rate_limits_identifier_hash_check
    check (identifier_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists auth_rate_limits_window_started_at_idx
  on private.auth_rate_limits (window_started_at);

alter table private.auth_rate_limits enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on table private.auth_rate_limits from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_started_at timestamptz;
  v_window_seconds integer;
begin
  if nullif(btrim(p_scope), '') is null then
    raise exception 'scope is required';
  end if;
  if p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'identifier hash must be lowercase SHA-256';
  end if;
  if p_limit < 1 then
    raise exception 'limit must be positive';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'window must be between 1 and 86400 seconds';
  end if;

  -- Bound storage and pseudonymous-identifier retention. The maximum accepted
  -- window is one day, so anything older cannot still be active.
  delete from private.auth_rate_limits
  where window_started_at < v_now - interval '1 day';

  insert into private.auth_rate_limits as current_limit (
    scope,
    identifier_hash,
    window_started_at,
    window_seconds,
    request_count
  ) values (
    btrim(p_scope),
    p_identifier_hash,
    v_now,
    p_window_seconds,
    1
  )
  on conflict (scope, identifier_hash) do update
  set request_count = case
        when current_limit.window_started_at
             + make_interval(secs => current_limit.window_seconds) <= v_now
          then 1
        else current_limit.request_count + 1
      end,
      window_started_at = case
        when current_limit.window_started_at
             + make_interval(secs => current_limit.window_seconds) <= v_now
          then v_now
        else current_limit.window_started_at
      end,
      window_seconds = case
        when current_limit.window_started_at
             + make_interval(secs => current_limit.window_seconds) <= v_now
          then p_window_seconds
        else current_limit.window_seconds
      end
  returning request_count, window_started_at, window_seconds
       into v_count, v_started_at, v_window_seconds;

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at := v_started_at + make_interval(secs => v_window_seconds);
  return next;
end;
$function$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;
