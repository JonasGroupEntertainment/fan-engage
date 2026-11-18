import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "./push";
import { sendSmsToFan } from "./sms";
import { getPreferences, isOptedIn, isInQuietHours } from "./preferences";
import type { NotificationType, PushPayload, Channel } from "./types";

/**
 * High-level dispatcher. Given a fan + a notification type + a payload,
 * decides which channels to fire on, respects opt-ins and quiet hours,
 * and writes one row to `notification_log` per channel attempt (sent OR
 * suppressed).
 *
 * **Critical contract**: this function NEVER throws. Every notification
 * trigger lives at the tail of an existing user-facing action; if push
 * goes sideways we still want the action to succeed.
 *
 * Quiet hours suppress push only — SMS is always urgent enough to
 * override. Neither Twilio nor Mailchimp Transactional snoozes these
 * sends. Easy to flip later if behavior should change.
 */
export async function sendNotification(opts: {
  fanId: string;
  type: NotificationType;
  payload: PushPayload;
  /** Channels to attempt. Defaults to ["push","sms"] — caller can narrow. */
  channels?: Channel[];
  /** Bypass the SMS tier gate (for high-priority confirmations). */
  bypassSmsTierGate?: boolean;
  /** Bypass quiet-hours check (for high-priority confirmations). */
  bypassQuietHours?: boolean;
}): Promise<void> {
  try {
    const channels = opts.channels ?? ["push", "sms"];
    const prefs = await getPreferences(opts.fanId);
    const inQuietHours = !opts.bypassQuietHours && isInQuietHours(prefs);
    const admin = createAdminClient();

    const logRows: Array<Record<string, unknown>> = [];

    // ── Push ────────────────────────────────────────────────────────
    if (channels.includes("push")) {
      if (!isOptedIn(prefs, "push", opts.type)) {
        logRows.push({
          fan_id: opts.fanId,
          channel: "push",
          notification_type: opts.type,
          title: opts.payload.title,
          body: opts.payload.body,
          url: opts.payload.url,
          status: "suppressed",
          suppression_reason: prefs.push_enabled ? "type_opted_out" : "channel_opted_out",
        });
      } else if (inQuietHours) {
        logRows.push({
          fan_id: opts.fanId,
          channel: "push",
          notification_type: opts.type,
          title: opts.payload.title,
          body: opts.payload.body,
          url: opts.payload.url,
          status: "suppressed",
          suppression_reason: "quiet_hours",
        });
      } else {
        const pushResult = await sendPush(opts.fanId, opts.payload);
        logRows.push({
          fan_id: opts.fanId,
          channel: "push",
          notification_type: opts.type,
          title: opts.payload.title,
          body: opts.payload.body,
          url: opts.payload.url,
          status: pushResult.sent > 0 ? "sent" : "failed",
          metadata: {
            sent: pushResult.sent,
            failed: pushResult.failed,
            expired: pushResult.expired,
          },
        });
      }
    }

    // ── SMS ─────────────────────────────────────────────────────────
    if (channels.includes("sms")) {
      if (!isOptedIn(prefs, "sms", opts.type)) {
        logRows.push({
          fan_id: opts.fanId,
          channel: "sms",
          notification_type: opts.type,
          body: opts.payload.body,
          status: "suppressed",
          suppression_reason: prefs.sms_enabled ? "type_opted_out" : "channel_opted_out",
        });
      } else {
        const smsBody = `${opts.payload.title}: ${opts.payload.body}`.slice(0, 280);
        const smsResult = await sendSmsToFan({
          fanId: opts.fanId,
          body: smsBody,
          bypassTierGate: opts.bypassSmsTierGate,
        });
        logRows.push({
          fan_id: opts.fanId,
          channel: "sms",
          notification_type: opts.type,
          body: smsBody,
          status: smsResult.sent ? "sent" : "suppressed",
          suppression_reason: smsResult.sent ? null : smsResult.suppressionReason,
          error: smsResult.error,
        });
      }
    }

    if (logRows.length > 0) {
      await admin.from("notification_log").insert(logRows);
    }
  } catch (err) {
    // Never throw — notifications are non-essential.
    console.warn("sendNotification swallowed error:", err);
  }
}

/** Fire-and-forget convenience wrapper for use at the tail of server actions. */
export function sendNotificationAsync(opts: Parameters<typeof sendNotification>[0]): void {
  sendNotification(opts).catch((err) => {
    console.warn("sendNotificationAsync swallowed:", err);
  });
}
