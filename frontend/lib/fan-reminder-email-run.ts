import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/app-url";
import { mandrillConfigured, sendMandrillBatch } from "@/lib/email/transactional";
import { getPreferences, isInQuietHours } from "@/lib/notifications/preferences";
import { preferenceColumnFor, type NotificationType } from "@/lib/notifications/types";
import {
  FAN_REMINDER_EMAIL_TAGS,
  REMINDER_EMAIL_LOG_TYPE,
  isFanReminderEmailEnabled,
  type ReminderEmailArtist,
  type ReminderEmailFan,
  type ReminderEmailKind,
} from "@/lib/fan-reminder-email";
import {
  sendFanReminderEmail,
  type ReminderEmailDeps,
  type ReminderEmailLogRow,
  type ReminderEmailOutcome,
  type ReminderEmailPrefs,
  type ReminderEmailRequest,
} from "@/lib/fan-reminder-email-send";

/**
 * Supabase and Mandrill bindings for the reminder emails. The rules are
 * in lib/fan-reminder-email.ts and the send flow in
 * lib/fan-reminder-email-send.ts. Called per fan from the streak-at-risk
 * and leaderboard-notifications crons, right after the push and inbox
 * reminder. Never throws.
 */

type Admin = ReturnType<typeof createAdminClient>;

const FAN_COLUMNS =
  "id, email, first_name, email_opted_in, suspended, is_internal, unsubscribe_token";
/** Rows in these states count against the 7 day cap. */
const CAP_STATUSES = ["queued", "sent"];

const PREFERENCE_TYPE: Record<ReminderEmailKind, NotificationType> = {
  streak_at_risk: "streak_at_risk",
  leaderboard_overtaken: "leaderboard",
};

async function loadFan(admin: Admin, fanId: string): Promise<ReminderEmailFan | null> {
  const { data, error } = await admin.from("fans").select(FAN_COLUMNS).eq("id", fanId).maybeSingle();
  if (error) throw new Error(`fans: ${error.message}`);
  return (data as ReminderEmailFan | null) ?? null;
}

async function loadPrefs(fanId: string, reminder: ReminderEmailKind): Promise<ReminderEmailPrefs> {
  const prefs = await getPreferences(fanId);
  return {
    typeAllowed: prefs[preferenceColumnFor(PREFERENCE_TYPE[reminder])] !== false,
    inQuietHours: isInQuietHours(prefs),
  };
}

/** The fan's first active community whose artist is live. */
async function loadArtist(admin: Admin, fanId: string): Promise<ReminderEmailArtist | null> {
  const memberships = await admin
    .from("fan_community_memberships")
    .select("community_id")
    .eq("fan_id", fanId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (memberships.error) throw new Error(`fan_community_memberships: ${memberships.error.message}`);
  const slugs = (memberships.data ?? []).map((row) => row.community_id as string).filter(Boolean);
  if (slugs.length === 0) return null;

  const artists = await admin.from("artists").select("slug, name").in("slug", slugs).eq("active", true);
  if (artists.error) throw new Error(`artists: ${artists.error.message}`);
  const bySlug = new Map((artists.data ?? []).map((a) => [a.slug as string, a.name as string | null]));
  const slug = slugs.find((s) => Boolean(bySlug.get(s)));
  return slug ? { slug, name: bySlug.get(slug) as string } : null;
}

async function hasRecentReminderEmail(admin: Admin, fanId: string, sinceIso: string): Promise<boolean> {
  const { data, error } = await admin
    .from("notification_log")
    .select("id")
    .eq("fan_id", fanId)
    .eq("channel", "email")
    .eq("notification_type", REMINDER_EMAIL_LOG_TYPE)
    .in("status", CAP_STATUSES)
    .gte("sent_at", sinceIso)
    .limit(1);
  if (error) throw new Error(`notification_log: ${error.message}`);
  return (data ?? []).length > 0;
}

async function claim(admin: Admin, row: ReminderEmailLogRow): Promise<string> {
  const { data, error } = await admin.from("notification_log").insert(row).select("id").single();
  if (error || !data?.id) throw new Error(`notification_log insert: ${error?.message ?? "no id returned"}`);
  return data.id as string;
}

async function finish(
  admin: Admin,
  claimId: string,
  result: { status: "sent" | "failed"; error: string | null },
): Promise<void> {
  const { error } = await admin
    .from("notification_log")
    .update({ status: result.status, error: result.error })
    .eq("id", claimId);
  if (error) throw new Error(`notification_log update: ${error.message}`);
}

function reminderEmailDeps(admin: Admin): ReminderEmailDeps {
  return {
    loadFan: (fanId) => loadFan(admin, fanId),
    loadPrefs,
    loadArtist: (fanId) => loadArtist(admin, fanId),
    hasRecentReminderEmail: (fanId, sinceIso) => hasRecentReminderEmail(admin, fanId, sinceIso),
    claim: (row) => claim(admin, row),
    finish: (claimId, result) => finish(admin, claimId, result),
    send: (recipients) => sendMandrillBatch(recipients, FAN_REMINDER_EMAIL_TAGS),
  };
}

/**
 * Email one reminder to one fan if every rule allows it. With the switch
 * off this returns at once and touches nothing.
 */
export async function emailFanReminder(request: ReminderEmailRequest): Promise<ReminderEmailOutcome> {
  try {
    const enabled = isFanReminderEmailEnabled();
    if (!enabled) return { status: "skipped", reason: "disabled" };
    return await sendFanReminderEmail({
      request,
      enabled,
      providerReady: mandrillConfigured(),
      appUrl: APP_URL,
      now: new Date(),
      deps: reminderEmailDeps(createAdminClient()),
    });
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
