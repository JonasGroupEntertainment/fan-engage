-- 0102_founding_fan_claim_on_any_join.sql
--
-- Port of Brand Engage Pro 0108 (#185): a Founding Fan number is claimed
-- whenever someone becomes a member of a community, by any route.
--
-- Before this file the number was claimed only by the onboarding route
-- (app/api/fan-engage/onboard/route.ts, step 3). Since 0088 (Follow = Join),
-- a fan who taps Follow on an artist page becomes a member through the
-- sync_membership_from_following trigger and never passes through
-- onboarding, so they got no Founding Fan number while spots were open.
-- BEP hit exactly this with its first real member the day before launch.
--
-- claim_founding_fan_status (0073) is already safe to call more than once:
-- an existing number is kept, internal fans (fans.is_internal and the
-- hidden list) do not count toward the 100, and it returns null when the
-- membership row is missing or the 100 are taken. This file only adds a
-- trigger that calls it on every new membership row. It does not change
-- the function and does not backfill existing members.
--
-- Auth: claim_founding_fan_status refuses an authenticated caller whose
-- auth.uid() is not the fan. A follow by the fan themself passes; any
-- refusal or other error is caught, so joining never fails because of
-- the claim. The onboarding route still calls the RPC as before.
--
-- Idempotent. Rollback:
--   drop trigger if exists memberships_claim_founding_fan on public.fan_community_memberships;
--   drop function if exists public.claim_founding_fan_on_join();

create or replace function public.claim_founding_fan_on_join()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.founding_fan_number is null then
    begin
      perform public.claim_founding_fan_status(new.fan_id, new.community_id);
    exception when others then
      -- Joining must never fail because the founding claim did.
      raise warning 'claim_founding_fan_on_join failed for % / %: %',
        new.fan_id, new.community_id, sqlerrm;
    end;
  end if;
  return null;
end $function$;

revoke all on function public.claim_founding_fan_on_join() from public, anon, authenticated;

drop trigger if exists memberships_claim_founding_fan on public.fan_community_memberships;

create trigger memberships_claim_founding_fan
  after insert on public.fan_community_memberships
  for each row execute function public.claim_founding_fan_on_join();
