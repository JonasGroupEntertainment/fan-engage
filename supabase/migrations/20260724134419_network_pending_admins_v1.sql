-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- Pre-authorized admins: when these emails create their fan account, they are
-- auto-promoted to owner. Insert-only; removing an email stops future promotion.
create table if not exists public.network_pending_admins (
  email text primary key,
  role text not null default 'owner',
  community_id text not null default '*',
  added_by text not null default 'kevin_request_2026_07_24',
  created_at timestamptz not null default now()
);
alter table public.network_pending_admins enable row level security;

insert into public.network_pending_admins (email) values
  ('go4it@jonasgroup.com'), ('hanaproductmanager@gmail.com'), ('aiassistant@jonasgroup.com')
on conflict (email) do nothing;

create or replace function public.network_promote_pending_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if exists (select 1 from network_pending_admins p where p.email = lower(new.email::text)) then
      insert into admin_users (user_id, community_id, role)
      select new.id, p.community_id, p.role from network_pending_admins p
      where p.email = lower(new.email::text)
      on conflict do nothing;
    end if;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists network_promote_admin on public.fans;
create trigger network_promote_admin after insert on public.fans
  for each row execute function public.network_promote_pending_admin();
revoke execute on function public.network_promote_pending_admin() from public, anon, authenticated;

-- Register the AI staff as network agents (keys for the RPC doorway)
insert into public.network_publishers (app_name) values
  ('syncnatra'), ('hana'), ('jg_ai_assistant')
on conflict (app_name) do nothing;
