-- Backfilled from live database (project uhovonrljcauaoctypbg) on 2026-08-06; applied out-of-band via SQL editor, missing from repo history.

-- ============================================================
-- TRUST LADDER v1 (additive) — graduated autonomy per action type.
-- supervised: every instance needs Kevin.        (all new types start here)
-- patterned:  instances matching previously-approved patterns auto-approve;
--             deviations still go to Kevin.
-- delegated:  full auto-approval for the type.
-- HARD FLOOR: category legal/hr/financial can NEVER leave supervised,
-- enforced in code paths, not convention. Any rejection demotes one level.
-- ============================================================

create table if not exists public.network_trust_policy (
  action_type text primary key,
  level text not null default 'supervised' check (level in ('supervised','patterned','delegated')),
  category text not null default 'standard' check (category in ('standard','legal','hr','financial')),
  pinned boolean not null default false,          -- true = level never auto-changes
  approvals_to_patterned int not null default 2,  -- consecutive approvals to reach patterned
  approvals_to_delegated int not null default 8,  -- total approvals (0 recent rejections) to reach delegated
  updated_at timestamptz not null default now(),
  notes text
);
alter table public.network_trust_policy enable row level security;

create table if not exists public.network_trust_log (
  id bigint generated always as identity primary key,
  action_type text not null,
  from_level text,
  to_level text not null,
  cause text not null,
  created_at timestamptz not null default now()
);
alter table public.network_trust_log enable row level security;

-- Seed current action types (all supervised) + permanent floors for money/legal/HR
insert into public.network_trust_policy (action_type, category, pinned, notes) values
  ('nudge.streak','standard',false,null),
  ('note.anniversary','standard',false,null),
  ('winback.quiet_superfan','standard',false,null),
  ('moment.draft','standard',false,null),
  ('moment.launch','standard',false,null),
  ('recap.weekly','standard',false,null),
  ('payout.transfer','financial',true,'Hard floor: money movement is never autonomous'),
  ('refund.issue','financial',true,'Hard floor'),
  ('pricing.change','financial',true,'Hard floor'),
  ('contract.action','legal',true,'Hard floor'),
  ('hiring.action','hr',true,'Hard floor'),
  ('key.rotation','financial',true,'Hard floor: security config')
on conflict (action_type) do nothing;

-- Unknown action types default to supervised/standard at evaluation time.
create or replace function public.network_trust_level(p_type text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select category from network_trust_policy where action_type = p_type), 'standard')
         in ('legal','hr','financial') then 'supervised'
    else coalesce((select level from network_trust_policy where action_type = p_type), 'supervised')
  end;
$$;

-- Pattern fingerprint of an action: artist + bucketed magnitude of any numeric payload value
create or replace function public.network_action_fingerprint(p_artist text, p_payload jsonb)
returns text language sql immutable as $$
  select coalesce(p_artist,'-') || '|' ||
    coalesce((select string_agg(k || ':' ||
        case when jsonb_typeof(p_payload->k) = 'number'
             then width_bucket((p_payload->>k)::numeric, 0, 1000, 5)::text
             else 'x' end, ',' order by k)
      from jsonb_object_keys(p_payload) k
      where k not in ('draft')), '-');
$$;

-- Auto-approval pass: runs after concierge proposals and hourly with the watchdog
create or replace function public.network_auto_approve()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_level text; v_seen boolean;
begin
  for r in select * from network_actions where status in ('proposed','drafted') and ring = 'gated'
  loop
    v_level := network_trust_level(r.action_type);

    if v_level = 'delegated' then
      update network_actions set status = 'approved',
        decided_by = 'trust_policy:delegated', decided_at = now()
      where id = r.id and status in ('proposed','drafted');

    elsif v_level = 'patterned' then
      -- approve only if an action of this type with the same fingerprint
      -- was previously HUMAN-approved
      select exists (
        select 1 from network_actions prior
        where prior.action_type = r.action_type
          and prior.id <> r.id
          and prior.status in ('approved','executed')
          and prior.decided_by not like 'trust_policy%'
          and network_action_fingerprint(prior.artist_slug, prior.payload)
              = network_action_fingerprint(r.artist_slug, r.payload)
      ) into v_seen;
      if v_seen then
        update network_actions set status = 'approved',
          decided_by = 'trust_policy:patterned', decided_at = now()
        where id = r.id and status in ('proposed','drafted');
      else
        update network_actions set reason = coalesce(reason,'') || ' [deviation: new pattern for patterned type — needs human approval]'
        where id = r.id and reason not like '%[deviation:%';
      end if;
    end if;
  end loop;
end $$;
revoke execute on function public.network_auto_approve() from public, anon, authenticated;

-- Promotion engine: daily, based on Kevin's actual decisions + outcomes
create or replace function public.network_update_trust()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v record; v_new text;
begin
  for r in select * from network_trust_policy where not pinned and category = 'standard'
  loop
    select
      count(*) filter (where status in ('approved','executed') and decided_by not like 'trust_policy%') as human_approvals,
      count(*) filter (where status = 'rejected' and decided_at > now() - interval '30 days') as recent_rejections,
      coalesce((select count(*) from network_actions a2
        where a2.action_type = r.action_type and a2.status = 'rejected'
          and a2.decided_at > (select max(a3.decided_at) from network_actions a3
                               where a3.action_type = r.action_type
                                 and a3.status in ('approved','executed'))), 0) as rejections_since_last_approval
    into v
    from network_actions where action_type = r.action_type;

    v_new := r.level;
    if v.recent_rejections = 0 then
      if v.human_approvals >= r.approvals_to_delegated then v_new := 'delegated';
      elsif v.human_approvals >= r.approvals_to_patterned then v_new := 'patterned';
      end if;
    end if;

    if v_new <> r.level then
      update network_trust_policy set level = v_new, updated_at = now() where action_type = r.action_type;
      insert into network_trust_log (action_type, from_level, to_level, cause)
      values (r.action_type, r.level, v_new,
              format('promotion: %s human approvals, %s rejections in 30d', v.human_approvals, v.recent_rejections));
      insert into network_actions (action_type, ring, payload, reason, proposed_by, dedupe_key)
      values ('trust.level_changed', 'free',
              jsonb_build_object('type', r.action_type, 'from', r.level, 'to', v_new),
              format('Trust ladder: %s promoted %s → %s based on your approval history', r.action_type, r.level, v_new),
              'trust_engine', 'trust:' || r.action_type || ':' || v_new || ':' || current_date)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
end $$;
revoke execute on function public.network_update_trust() from public, anon, authenticated;

-- Instant demotion on any rejection (one level down, never below supervised)
create or replace function public.network_demote_on_rejection()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cur text;
begin
  begin
    if new.status = 'rejected' and coalesce(old.status,'') <> 'rejected' then
      select level into v_cur from network_trust_policy
      where action_type = new.action_type and not pinned and category = 'standard';
      if v_cur in ('patterned','delegated') then
        update network_trust_policy
        set level = case v_cur when 'delegated' then 'patterned' else 'supervised' end,
            updated_at = now()
        where action_type = new.action_type;
        insert into network_trust_log (action_type, from_level, to_level, cause)
        values (new.action_type, v_cur,
                case v_cur when 'delegated' then 'patterned' else 'supervised' end,
                'demotion: action #' || new.id || ' rejected by ' || coalesce(new.decided_by,'?'));
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists network_trust_demotion on public.network_actions;
create trigger network_trust_demotion
  after update on public.network_actions
  for each row execute function public.network_demote_on_rejection();
revoke execute on function public.network_demote_on_rejection() from public, anon, authenticated;

-- Schedules: trust update daily 04:20 (before everything), auto-approve daily 04:45
-- (after concierge) and hourly at :10 (after watchdog)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('network_trust_update','network_auto_approve_daily','network_auto_approve_hourly');
exception when others then null;
end $$;
select cron.schedule('network_trust_update', '20 4 * * *', $$select public.network_update_trust()$$);
select cron.schedule('network_auto_approve_daily', '45 4 * * *', $$select public.network_auto_approve()$$);
select cron.schedule('network_auto_approve_hourly', '10 * * * *', $$select public.network_auto_approve()$$);
