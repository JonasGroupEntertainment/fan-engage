-- Rollback for 0100_notifications_community.sql
--
-- Run one statement at a time, in order.
-- Fan Engage Supabase project: uhovonrljcauaoctypbg
--
-- This restores the table and upsert_notification. It does NOT restore the
-- old bodies of award_community_badge and redeem_reward: both keep working
-- against the seven-argument function only if their last argument is
-- removed again. Re-create them from migrations 0078 and 0050 (or from the
-- copy in 0100 with that argument taken out) BEFORE statement 4.

-- 1. Put the default back.
alter table public.notifications alter column community_id set default 'raelynn';

-- 2. Rows written with no community while 0100 was live go back to the old
--    default, so NOT NULL can be restored. This does change rows.
update public.notifications set community_id = 'raelynn' where community_id is null;

-- 3. NOT NULL again.
alter table public.notifications alter column community_id set not null;

-- 4. Restore the seven-argument upsert_notification (see the note above
--    about its two callers first).
do $swap$
begin
  drop function if exists public.upsert_notification(uuid, text, text, text, text, text, text, text);

  create function public.upsert_notification(
    p_fan_id uuid,
    p_kind text,
    p_title text,
    p_body text default null,
    p_url text default null,
    p_icon text default null,
    p_dedup_key text default null
  )
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  begin
    if p_dedup_key is not null then
      if exists (
        select 1 from notifications
        where fan_id = p_fan_id and dedup_key = p_dedup_key
      ) then return; end if;
    end if;
    insert into notifications (fan_id, kind, title, body, url, icon, dedup_key)
    values (p_fan_id, p_kind, p_title, p_body, p_url, p_icon, p_dedup_key);
  exception when unique_violation then
    return;
  end
  $fn$;

  revoke all on function public.upsert_notification(uuid, text, text, text, text, text, text) from public, anon, authenticated;
  grant execute on function public.upsert_notification(uuid, text, text, text, text, text, text) to service_role;
end
$swap$;
