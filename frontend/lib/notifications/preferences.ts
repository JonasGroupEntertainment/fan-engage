import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationPreferences, NotificationType } from "./types";
import { preferenceColumnFor } from "./types";

/**
 * Lazy fetch of a fan's notification preferences. If the row doesn't exist
 * yet (fan never visited /me/notifications), we return the schema
 * defaults — push_enabled false, sms_enabled false, all granular flags true.
 */
export async function getPreferences(
  fanId: string,
): Promise<NotificationPreferences> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("fan_id", fanId)
    .maybeSingle();

  if (data) return data as NotificationPreferences;

  // Schema defaults — keep in sync with migration.sql
  return {
    fan_id: fanId,
    push_enabled: false,
    sms_enabled: false,
    notify_new_post: true,
    notify_event_match: true,
    notify_comment_on_my_post: true,
    notify_redemption: true,
    notify_drops: true,
    notify_rsvp_confirmation: true,
    notify_leaderboard: true,
    quiet_start: null,
    quiet_end: null,
    timezone: "America/Chicago",
  };
}

/**
 * Upsert a fan's preferences. Caller passes the partial diff; we merge
 * onto the existing row (or seed with defaults if no row).
 */
export async function setPreferences(
  fanId: string,
  patch: Partial<NotificationPreferences>,
): Promise<void> {
  const admin = createAdminClient();
  const current = await getPreferences(fanId);
  const merged = { ...current, ...patch, fan_id: fanId, updated_at: new Date().toISOString() };
  await admin
    .from("notification_preferences")
    .upsert(merged, { onConflict: "fan_id" });
}

/**
 * Check whether the fan has opted in to receiving this notification type.
 * Combines the global push/sms toggle (per channel) with the granular
 * `notify_<type>` flag.
 */
export function isOptedIn(
  prefs: NotificationPreferences,
  channel: "push" | "sms",
  type: NotificationType,
): boolean {
  const channelEnabled = channel === "push" ? prefs.push_enabled : prefs.sms_enabled;
  if (!channelEnabled) return false;
  const col = preferenceColumnFor(type);
  return Boolean(prefs[col]);
}

/**
 * True if `now` falls inside the fan's quiet-hours window.
 *
 * Quiet hours are stored as wall-clock times in the fan's timezone. A
 * window like 22:00–08:00 wraps midnight; we handle that case by
 * checking either side of the wrap.
 *
 * If the timezone string is invalid for some reason, we fall back to UTC
 * — better to occasionally over-deliver than to silently swallow.
 */
export function isInQuietHours(
  prefs: NotificationPreferences,
  now: Date = new Date(),
): boolean {
  if (!prefs.quiet_start || !prefs.quiet_end) return false;
  const [sH, sM] = prefs.quiet_start.split(":").map(Number);
  const [eH, eM] = prefs.quiet_end.split(":").map(Number);
  if (
    !Number.isFinite(sH) ||
    !Number.isFinite(sM) ||
    !Number.isFinite(eH) ||
    !Number.isFinite(eM)
  ) {
    return false;
  }

  // Get HH:MM in the fan's timezone
  const localStr = new Intl.DateTimeFormat("en-US", {
    timeZone: prefs.timezone || "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [nH, nM] = localStr.split(":").map(Number);
  const nowMin = nH * 60 + nM;
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;

  if (startMin < endMin) {
    // Same-day window, e.g., 13:00–17:00
    return nowMin >= startMin && nowMin < endMin;
  } else {
    // Wrap window, e.g., 22:00–08:00
    return nowMin >= startMin || nowMin < endMin;
  }
}
