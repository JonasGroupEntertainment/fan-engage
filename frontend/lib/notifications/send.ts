import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "./push";
import { smsSendClassForNotification, type SmsMessageType } from "@/lib/sms/kinds";
import { sendSmsToFan } from "./sms";
import { getPreferences, isOptedIn, isInQuietHours } from "./preferences";
import { mirrorReminderToInbox, type InboxMirror, type InboxMirrorResult } from "./inbox-mirror";
import { runSideBySide } from "./side-by-side";
import { inboxMirrorDeps } from "./inbox-store";
import type { NotificationPreferences, NotificationType, PushPayload, Channel } from "./types";

type SendOptions = {
  fanId: string;
  type: NotificationType;
  payload: PushPayload;
  inbox?: InboxMirror;
};

function inboxLogRow(opts: SendOptions, result: InboxMirrorResult): Record<string, unknown> {
  const written = result.status === "written" || result.status === "duplicate";
  return {
    fan_id: opts.fanId,
    channel: "in_app",
    notification_type: opts.type,
    title: opts.payload.title,
    body: opts.inbox?.body ?? opts.payload.body,
    url: opts.inbox?.url ?? opts.payload.url,
    status: written ? "sent" : result.status === "failed" ? "failed" : "suppressed",
    suppression_reason: result.status === "suppressed" ? result.reason : null,
    error: result.status === "failed" ? result.error : null,
    metadata: { inbox_kind: opts.inbox?.kind, dedup_key: opts.inbox?.dedupKey, outcome: result.status },
  };
}

/**
 * The inbox copy of a reminder (rules in ./inbox-mirror.ts). Written
 * whether or not push is on, so a fan without push still sees it. Never
 * throws; returns the notification_log row that records what happened.
 */
async function mirrorToInbox(
  admin: ReturnType<typeof createAdminClient>,
  opts: SendOptions & { inbox: InboxMirror },
  prefs: NotificationPreferences,
): Promise<Record<string, unknown>> {
  const result = await mirrorReminderToInbox(inboxMirrorDeps(admin), {
    fanId: opts.fanId,
    type: opts.type,
    prefs,
    mirror: opts.inbox,
    title: opts.payload.title,
    pushBody: opts.payload.body,
    pushUrl: opts.payload.url,
    now: new Date(),
  });
  if (result.status === "failed") {
    console.warn("sendNotification: inbox copy failed:", result.error);
  }
  return inboxLogRow(opts, result);
}

type LogRow = Record<string, unknown>;

type ChannelOptions = SendOptions & {
  bypassSmsTierGate?: boolean;
  smsMessageType?: SmsMessageType;
};

function pushLogBase(opts: SendOptions): LogRow {
  return {
    fan_id: opts.fanId,
    channel: "push",
    notification_type: opts.type,
    title: opts.payload.title,
    body: opts.payload.body,
    url: opts.payload.url,
  };
}

async function pushAttempt(
  opts: SendOptions,
  prefs: NotificationPreferences,
  inQuietHours: boolean,
): Promise<LogRow> {
  if (!isOptedIn(prefs, "push", opts.type)) {
    return {
      ...pushLogBase(opts),
      status: "suppressed",
      suppression_reason: prefs.push_enabled ? "type_opted_out" : "channel_opted_out",
    };
  }
  if (inQuietHours) {
    return { ...pushLogBase(opts), status: "suppressed", suppression_reason: "quiet_hours" };
  }
  const pushResult = await sendPush(opts.fanId, opts.payload);
  return {
    ...pushLogBase(opts),
    status: pushResult.sent > 0 ? "sent" : "failed",
    metadata: {
      sent: pushResult.sent,
      failed: pushResult.failed,
      expired: pushResult.expired,
    },
  };
}

async function smsAttempt(opts: ChannelOptions, prefs: NotificationPreferences): Promise<LogRow> {
  if (!isOptedIn(prefs, "sms", opts.type)) {
    return {
      fan_id: opts.fanId,
      channel: "sms",
      notification_type: opts.type,
      body: opts.payload.body,
      status: "suppressed",
      suppression_reason: prefs.sms_enabled ? "type_opted_out" : "channel_opted_out",
    };
  }
  const smsBody = `${opts.payload.title}: ${opts.payload.body}`.slice(0, 280);
  const smsClass = opts.smsMessageType
    ? { messageType: opts.smsMessageType }
    : smsSendClassForNotification(opts.type);
  const smsResult = await sendSmsToFan({
    fanId: opts.fanId,
    body: smsBody,
    messageType: smsClass.messageType,
    bypassTierGate: opts.bypassSmsTierGate,
  });
  return {
    fan_id: opts.fanId,
    channel: "sms",
    notification_type: opts.type,
    body: smsBody,
    status: smsResult.sent ? "sent" : "suppressed",
    suppression_reason: smsResult.sent ? null : smsResult.suppressionReason,
    error: smsResult.error,
  };
}

/** Push, then SMS, in the order and with the rules they always had. */
async function channelAttempts(
  opts: ChannelOptions,
  channels: readonly Channel[],
  prefs: NotificationPreferences,
  inQuietHours: boolean,
): Promise<LogRow[]> {
  const push = channels.includes("push") ? [await pushAttempt(opts, prefs, inQuietHours)] : [];
  const sms = channels.includes("sms") ? [await smsAttempt(opts, prefs)] : [];
  return [...push, ...sms];
}

/**
 * High-level dispatcher. Given a fan + a notification type + a payload,
 * decides which channels to fire on, respects opt-ins and quiet hours,
 * and writes one row to `notification_log` per channel attempt (sent OR
 * suppressed).
 *
 * When the caller passes `inbox`, the reminder is also written to the
 * fan's in-app inbox, whatever the push and SMS settings are. The inbox
 * write and the push / SMS sends run side by side: neither waits for the
 * other, and a failure in one never affects the other.
 *
 * **Critical contract**: this function NEVER throws. Every notification
 * trigger lives at the tail of an existing user-facing action; if push
 * goes sideways we still want the action to succeed.
 *
 * Quiet hours suppress push only — SMS is always urgent enough to
 * override. Mailchimp does not snooze these sends. Easy to flip later
 * if behavior should change.
 */
export async function sendNotification(opts: {
  fanId: string;
  type: NotificationType;
  payload: PushPayload;
  /** Channels to attempt. Defaults to ["push","sms"]; the caller can narrow. */
  channels?: Channel[];
  /** Bypass the SMS tier gate (for high-priority confirmations). */
  bypassSmsTierGate?: boolean;
  /** Bypass quiet-hours check (for high-priority confirmations). */
  bypassQuietHours?: boolean;
  /**
   * Which SMS this is. Defaults from the notification type.
   * Anniversary and prediction reuse `drops` and pass their own type.
   */
  smsMessageType?: SmsMessageType;
  /**
   * Also write this reminder to the fan's inbox (see ./inbox-mirror.ts).
   * Leave it out only when something else already writes the inbox row.
   */
  inbox?: InboxMirror;
}): Promise<void> {
  try {
    const channels = opts.channels ?? ["push", "sms"];
    const prefs = await getPreferences(opts.fanId);
    const inQuietHours = !opts.bypassQuietHours && isInQuietHours(prefs);
    const admin = createAdminClient();
    const { inbox } = opts;

    const { rows, errors } = await runSideBySide<LogRow>([
      () => channelAttempts(opts, channels, prefs, inQuietHours),
      async () => (inbox ? [await mirrorToInbox(admin, { ...opts, inbox }, prefs)] : []),
    ]);
    for (const err of errors) {
      console.warn("sendNotification swallowed error:", err);
    }

    if (rows.length > 0) {
      await admin.from("notification_log").insert(rows);
    }
  } catch (err) {
    // Never throw: notifications are non-essential.
    console.warn("sendNotification swallowed error:", err);
  }
}

/** Fire-and-forget convenience wrapper for use at the tail of server actions. */
export function sendNotificationAsync(opts: Parameters<typeof sendNotification>[0]): void {
  sendNotification(opts).catch((err) => {
    console.warn("sendNotificationAsync swallowed:", err);
  });
}
