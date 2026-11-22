import type { TransactionalBatchResult, TransactionalRecipient } from "./email/transactional.ts";
import {
  buildEventReminderEmail,
  selectReminderEmailRecipients,
  type ReminderEvent,
  type ReminderFanRow,
  type ReminderKind,
} from "./event-reminder-email.ts";

/**
 * Sends the event reminder email: one message per fan who RSVPed and may
 * be emailed (rules in lib/event-reminder-email.ts).
 *
 * Mandrill only. There is deliberately no Mailchimp fallback here: a
 * Mailchimp campaign goes to the whole audience, and an RSVP reminder
 * must never reach someone who did not RSVP. With MANDRILL_API_KEY unset
 * the reminder email is simply not sent.
 *
 * Never throws. A failed read or send comes back as `error` so the cron
 * carries on with the next event.
 *
 * Relative imports and injected reads / sends, so it runs under node --test.
 */

export const EVENT_REMINDER_EMAIL_TAGS = ["event-reminder"] as const;
export const EVENT_REMINDER_NO_PROVIDER =
  "MANDRILL_API_KEY is not set; reminder email not sent";

export type ReminderRsvpAudience = {
  /** Every fan id with an RSVP for the event. */
  rsvpFanIds: readonly string[];
  /** The fans rows for those ids. */
  fans: readonly ReminderFanRow[];
};

export type ReminderEmailResult = {
  /** Fans who RSVPed and may be emailed. */
  recipients: number;
  sent: number;
  failed: number;
  /** Fans who RSVPed but may not be emailed (not opted in, suspended, internal, no address). */
  skipped: number;
  error: string | null;
};

const NOTHING_SENT: ReminderEmailResult = { recipients: 0, sent: 0, failed: 0, skipped: 0, error: null };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toRecipient(
  fan: ReminderFanRow,
  event: ReminderEvent,
  kind: ReminderKind,
  appUrl: string,
): TransactionalRecipient {
  const message = buildEventReminderEmail({
    event,
    kind,
    firstName: fan.first_name,
    appUrl,
    unsubscribeToken: fan.unsubscribe_token as string,
  });
  return { id: fan.id, email: (fan.email as string).trim(), name: "", ...message };
}

function summarize(recipients: number, skipped: number, batch: TransactionalBatchResult): ReminderEmailResult {
  const sent = batch.outcomes.filter((o) => o.ok).length;
  const failed = recipients - sent;
  const error = batch.error ?? (failed > 0 ? `${failed} of ${recipients} reminder emails failed` : null);
  return { recipients, sent, failed, skipped, error };
}

export async function sendEventReminderEmails(params: {
  event: ReminderEvent;
  kind: ReminderKind;
  appUrl: string;
  /** True when the per-fan (Mandrill) path is configured. */
  providerReady: boolean;
  loadAudience: (eventId: string) => Promise<ReminderRsvpAudience>;
  send: (recipients: readonly TransactionalRecipient[]) => Promise<TransactionalBatchResult>;
}): Promise<ReminderEmailResult> {
  const { event, kind, appUrl } = params;
  if (!params.providerReady) return { ...NOTHING_SENT, error: EVENT_REMINDER_NO_PROVIDER };

  let recipients: TransactionalRecipient[];
  let skipped: number;
  try {
    const audience = await params.loadAudience(event.id);
    recipients = selectReminderEmailRecipients(audience.rsvpFanIds, audience.fans).map((fan) =>
      toRecipient(fan, event, kind, appUrl),
    );
    skipped = new Set(audience.rsvpFanIds).size - recipients.length;
  } catch (err) {
    return { ...NOTHING_SENT, error: errorText(err) };
  }
  if (recipients.length === 0) return { ...NOTHING_SENT, skipped };

  try {
    return summarize(recipients.length, skipped, await params.send(recipients));
  } catch (err) {
    return { recipients: recipients.length, sent: 0, failed: recipients.length, skipped, error: errorText(err) };
  }
}
