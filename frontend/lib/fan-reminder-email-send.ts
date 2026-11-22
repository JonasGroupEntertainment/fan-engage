import type { TransactionalBatchResult, TransactionalRecipient } from "./email/transactional.ts";
import {
  REMINDER_EMAIL_CLAIM_LOST,
  REMINDER_EMAIL_LOG_TYPE,
  REMINDER_EMAIL_MIN_STREAK,
  buildOvertakenEmail,
  buildStreakReminderEmail,
  reminderEmailBlockReason,
  reminderEmailCapCutoffIso,
  winningReminderEmailClaim,
  type ReminderEmailArtist,
  type ReminderEmailBlockReason,
  type ReminderEmailClaim,
  type ReminderEmailFan,
  type ReminderEmailKind,
  type ReminderEmailMessage,
} from "./fan-reminder-email.ts";

/**
 * Sends one reminder email to one fan (rules and copy in
 * lib/fan-reminder-email.ts).
 *
 * Mandrill only, as for the event reminder: there is no Mailchimp
 * fallback, because a Mailchimp campaign goes to the whole audience.
 *
 * The 7 day cap is kept in notification_log, not in memory: before the
 * send a `queued` row is written (the claim), and after it the row
 * becomes `sent` or `failed`. A `queued` or `sent` row inside the window
 * blocks the next reminder email of any kind. A row left `queued` by a
 * crash still blocks, so the mistake is a missed email, never a second one.
 *
 * notification_log has no unique key, and the streak and leaderboard
 * crons can both run at 16:00 UTC, so two runs can pass the check and
 * both claim. Each therefore reads the claims back after writing its own,
 * and only the earliest claim sends; the other is marked failed.
 *
 * Never throws. Every way out is an outcome, so one fan's failure never
 * stops a cron for the others.
 *
 * Relative imports and injected reads / sends, so it runs under node --test.
 */

export const REMINDER_EMAIL_NO_PROVIDER =
  "MANDRILL_API_KEY is not set; reminder emails are not sent";

export type ReminderEmailRequest =
  | { reminder: "streak_at_risk"; fanId: string; streakDays: number; endsAtLocal: string }
  | {
      reminder: "leaderboard_overtaken";
      fanId: string;
      artist: ReminderEmailArtist;
      newRank: number;
      previousRank: number;
    };

export type ReminderEmailSkipReason =
  | ReminderEmailBlockReason
  | "disabled"
  | "provider_not_configured"
  | "streak_too_short"
  | "type_opted_out"
  | "quiet_hours"
  | "weekly_cap";

export type ReminderEmailOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: ReminderEmailSkipReason }
  | { status: "failed"; error: string };

export type ReminderEmailLogRow = {
  fan_id: string;
  channel: "email";
  notification_type: typeof REMINDER_EMAIL_LOG_TYPE;
  title: string;
  url: string;
  status: "queued";
  metadata: { reminder: ReminderEmailKind };
};

export type ReminderEmailPrefs = {
  /** False when the fan switched this kind of reminder off. */
  typeAllowed: boolean;
  inQuietHours: boolean;
};

export type ReminderEmailDeps = {
  loadFan: (fanId: string) => Promise<ReminderEmailFan | null>;
  loadPrefs: (fanId: string, reminder: ReminderEmailKind) => Promise<ReminderEmailPrefs>;
  /** The fan's own artist, for the streak email. Null when there is none. */
  loadArtist: (fanId: string) => Promise<ReminderEmailArtist | null>;
  /** The fan's queued and sent reminder email rows since `sinceIso`. */
  recentReminderEmails: (fanId: string, sinceIso: string) => Promise<ReminderEmailClaim[]>;
  /** Writes the `queued` row and returns its id. */
  claim: (row: ReminderEmailLogRow) => Promise<string>;
  finish: (claimId: string, result: { status: "sent" | "failed"; error: string | null }) => Promise<void>;
  send: (recipients: readonly TransactionalRecipient[]) => Promise<TransactionalBatchResult>;
};

let warnedNoProvider = false;

/** One warning per server instance, not one per fan. */
function warnNoProviderOnce(): void {
  if (warnedNoProvider) return;
  warnedNoProvider = true;
  console.warn(`fan reminder email: ${REMINDER_EMAIL_NO_PROVIDER}`);
}

/** Tests only. */
export function resetReminderEmailWarning(): void {
  warnedNoProvider = false;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function skipped(reason: ReminderEmailSkipReason): ReminderEmailOutcome {
  return { status: "skipped", reason };
}

async function buildMessage(
  request: ReminderEmailRequest,
  fan: ReminderEmailFan,
  appUrl: string,
  deps: ReminderEmailDeps,
): Promise<ReminderEmailMessage> {
  const shared = {
    firstName: fan.first_name,
    appUrl,
    unsubscribeToken: fan.unsubscribe_token as string,
  };
  if (request.reminder === "leaderboard_overtaken") {
    return buildOvertakenEmail({ ...shared, ...request });
  }
  const artist = await deps.loadArtist(request.fanId);
  return buildStreakReminderEmail({ ...shared, ...request, artist });
}

/** The checks that need a read. Null means the fan may be emailed now. */
async function skipReasonFor(
  request: ReminderEmailRequest,
  fan: ReminderEmailFan | null,
  deps: ReminderEmailDeps,
  now: Date,
): Promise<ReminderEmailSkipReason | null> {
  const blocked = reminderEmailBlockReason(fan);
  if (blocked) return blocked;

  const prefs = await deps.loadPrefs(request.fanId, request.reminder);
  if (!prefs.typeAllowed) return "type_opted_out";
  if (request.reminder === "streak_at_risk" && prefs.inQuietHours) return "quiet_hours";

  const recent = await deps.recentReminderEmails(request.fanId, reminderEmailCapCutoffIso(now));
  return recent.length > 0 ? "weekly_cap" : null;
}

/**
 * After our own claim is written: true only when it is the earliest claim
 * in the window. A read that does not show our row at all also loses, so
 * a doubt costs an email and never sends two.
 */
async function claimWon(
  claimId: string,
  fanId: string,
  deps: ReminderEmailDeps,
  now: Date,
): Promise<boolean> {
  const claims = await deps.recentReminderEmails(fanId, reminderEmailCapCutoffIso(now));
  return winningReminderEmailClaim(claims)?.id === claimId;
}

async function recordFinish(
  claimId: string,
  result: { status: "sent" | "failed"; error: string | null },
  deps: ReminderEmailDeps,
): Promise<void> {
  try {
    await deps.finish(claimId, result);
  } catch (err) {
    // The row stays `queued`, which still counts against the cap.
    console.warn("fan reminder email: could not update the send record:", errorText(err));
  }
}

async function deliver(
  fan: ReminderEmailFan,
  message: ReminderEmailMessage,
  deps: ReminderEmailDeps,
): Promise<string | null> {
  const batch = await deps.send([
    {
      id: fan.id,
      email: (fan.email as string).trim(),
      name: "",
      subject: message.subject,
      text: message.text,
      html: message.html,
    },
  ]);
  const outcome = batch.outcomes[0];
  if (outcome?.ok) return null;
  return batch.error ?? outcome?.error ?? "the email provider returned no result";
}

export async function sendFanReminderEmail(params: {
  request: ReminderEmailRequest;
  /** FAN_REMINDER_EMAIL_ENABLED is "1". */
  enabled: boolean;
  /** True when the per-fan (Mandrill) path is configured. */
  providerReady: boolean;
  appUrl: string;
  now: Date;
  deps: ReminderEmailDeps;
}): Promise<ReminderEmailOutcome> {
  const { request, deps, now } = params;
  if (!params.enabled) return skipped("disabled");
  if (!params.providerReady) {
    warnNoProviderOnce();
    return skipped("provider_not_configured");
  }
  if (request.reminder === "streak_at_risk" && request.streakDays < REMINDER_EMAIL_MIN_STREAK) {
    return skipped("streak_too_short");
  }

  let claimId: string;
  let fan: ReminderEmailFan;
  let message: ReminderEmailMessage;
  try {
    const loaded = await deps.loadFan(request.fanId);
    const reason = await skipReasonFor(request, loaded, deps, now);
    if (reason) return skipped(reason);
    fan = loaded as ReminderEmailFan;
    message = await buildMessage(request, fan, params.appUrl, deps);
    claimId = await deps.claim({
      fan_id: fan.id,
      channel: "email",
      notification_type: REMINDER_EMAIL_LOG_TYPE,
      title: message.subject,
      url: message.url,
      status: "queued",
      metadata: { reminder: request.reminder },
    });
  } catch (err) {
    // Nothing was claimed, so nothing is sent: without the record the
    // 7 day cap could not be kept.
    return { status: "failed", error: errorText(err) };
  }

  let won: boolean;
  try {
    won = await claimWon(claimId, fan.id, deps, now);
  } catch (err) {
    // Could not confirm the claim is the only one, so do not send.
    const error = errorText(err);
    await recordFinish(claimId, { status: "failed", error }, deps);
    return { status: "failed", error };
  }
  if (!won) {
    await recordFinish(claimId, { status: "failed", error: REMINDER_EMAIL_CLAIM_LOST }, deps);
    return skipped("weekly_cap");
  }

  let sendError: string | null;
  try {
    sendError = await deliver(fan, message, deps);
  } catch (err) {
    sendError = errorText(err);
  }
  await recordFinish(claimId, { status: sendError ? "failed" : "sent", error: sendError }, deps);
  return sendError ? { status: "failed", error: sendError } : { status: "sent" };
}
