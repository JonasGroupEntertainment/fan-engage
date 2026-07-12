-- ============================================================================
-- 0044_super_admin_grants.sql — super-admin grants requested by Kevin 7/12/26
-- ============================================================================
-- raymond@jonasgroup.com already has an auth user: grant directly.
-- hanaproductmanager@gmail.com + aiassistant@jonasgroup.com have not signed
-- in yet, so there is no auth.users row to grant against. The trigger below
-- auto-promotes those two emails to super admin on their first sign-in.
-- carla@jonasgroup.com + syncnatra@gmail.com already hold '*'/owner grants.
-- Idempotent. Safe to re-run.
-- ============================================================================

insert into public.admin_users (user_id, community_id, role)
select u.id, '*', 'owner'
from auth.users u
where lower(u.email) = 'raymond@jonasgroup.com'
on conflict do nothing;

create or replace function public.auto_grant_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) in ('hanaproductmanager@gmail.com', 'aiassistant@jonasgroup.com') then
    insert into public.admin_users (user_id, community_id, role)
    values (new.id, '*', 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_grant_super_admin on auth.users;
create trigger trg_auto_grant_super_admin
after insert on auth.users
for each row execute function public.auto_grant_super_admin();
