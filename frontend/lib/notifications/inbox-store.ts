import { createAdminClient } from "@/lib/supabase/admin";
import {
  INBOX_REMINDER_PRIORITY,
  UNCAPPED_INBOX_KINDS,
  type InboxFanRow,
  type InboxMirrorDeps,
  type InboxRow,
  type TodaysReminder,
} from "./inbox-mirror";

/**
 * Supabase reads and writes for the inbox copy of a reminder
 * (rules in ./inbox-mirror.ts). Every function throws on a database
 * error; mirrorReminderToInbox turns that into a `failed` result.
 */

type Admin = ReturnType<typeof createAdminClient>;

const UNIQUE_VIOLATION = "23505";
const REMINDER_KINDS: string[] = [...INBOX_REMINDER_PRIORITY, ...UNCAPPED_INBOX_KINDS];

async function loadFan(admin: Admin, fanId: string): Promise<InboxFanRow | null> {
  const { data, error } = await admin
    .from("fans")
    .select("suspended, is_internal")
    .eq("id", fanId)
    .maybeSingle();
  if (error) throw new Error(`fans: ${error.message}`);
  return (data as InboxFanRow | null) ?? null;
}

async function loadTodaysReminders(
  admin: Admin,
  fanId: string,
  sinceIso: string,
): Promise<TodaysReminder[]> {
  const { data, error } = await admin
    .from("notifications")
    .select("id, kind, dedup_key, read_at")
    .eq("fan_id", fanId)
    .in("kind", REMINDER_KINDS)
    .gte("created_at", sinceIso);
  if (error) throw new Error(`notifications: ${error.message}`);
  return (data ?? []) as TodaysReminder[];
}

async function insert(admin: Admin, row: InboxRow): Promise<"inserted" | "duplicate"> {
  const { error } = await admin.from("notifications").insert(row);
  if (!error) return "inserted";
  if (error.code === UNIQUE_VIOLATION) return "duplicate";
  throw new Error(`notifications insert: ${error.message}`);
}

async function remove(admin: Admin, id: string): Promise<void> {
  const { error } = await admin.from("notifications").delete().eq("id", id);
  if (error) throw new Error(`notifications delete: ${error.message}`);
}

export function inboxMirrorDeps(admin: Admin): InboxMirrorDeps {
  return {
    loadFan: (fanId) => loadFan(admin, fanId),
    loadTodaysReminders: (fanId, sinceIso) => loadTodaysReminders(admin, fanId, sinceIso),
    insert: (row) => insert(admin, row),
    remove: (id) => remove(admin, id),
  };
}
