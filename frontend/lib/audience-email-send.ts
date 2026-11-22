import type { TransactionalBatchResult, TransactionalRecipient } from "./email/transactional.ts";
import { buildAudienceEmail, type AudienceMessage } from "./audience-email.ts";
import { selectReminderEmailRecipients, type ReminderFanRow } from "./event-reminder-email.ts";

/**
 * Sends an admin's email to the fans they chose: one message per fan who
 * may be emailed (opted in, not suspended, not internal, has an address
 * and an unsubscribe token; the same gates as the event reminder).
 *
 * Mandrill only. There is deliberately no Mailchimp fallback: a Mailchimp
 * campaign goes to the whole audience, every artist and every tier. With
 * MANDRILL_API_KEY unset no email is sent and `configured` is false.
 *
 * Never throws. One fan's failed send is counted and the rest carry on.
 *
 * Relative imports and injected reads / sends, so it runs under node --test.
 */

export const AUDIENCE_EMAIL_NOT_READ = "could not read the chosen fans";

export type ChosenAudience = {
  /** Every fan the admin chose (the artist's fans, narrowed). */
  chosenFanIds: readonly string[];
  /** The fans rows for those ids. */
  fans: readonly ReminderFanRow[];
};

export type AudienceEmailResult = {
  /** False when the per-fan mail key is missing. */
  configured: boolean;
  /** Fans the admin chose, counted once each. */
  chosen: number;
  sent: number;
  failed: number;
  /** Chosen fans who may not be emailed. */
  skipped: number;
  /** A failure that stopped the read or every send. */
  error: string | null;
};

const NOTHING_SENT: AudienceEmailResult = {
  configured: true,
  chosen: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  error: null,
};

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toRecipient(fan: ReminderFanRow, message: AudienceMessage, appUrl: string): TransactionalRecipient {
  const email = buildAudienceEmail({
    message,
    appUrl,
    unsubscribeToken: fan.unsubscribe_token as string,
  });
  return { id: fan.id, email: (fan.email as string).trim(), name: "", ...email };
}

export async function sendAudienceEmails(params: {
  message: AudienceMessage;
  appUrl: string;
  /** True when the per-fan (Mandrill) path is configured. */
  providerReady: boolean;
  loadAudience: () => Promise<ChosenAudience>;
  send: (recipients: readonly TransactionalRecipient[]) => Promise<TransactionalBatchResult>;
}): Promise<AudienceEmailResult> {
  if (!params.providerReady) return { ...NOTHING_SENT, configured: false };

  let recipients: TransactionalRecipient[];
  let chosen: number;
  try {
    const audience = await params.loadAudience();
    chosen = new Set(audience.chosenFanIds).size;
    recipients = selectReminderEmailRecipients(audience.chosenFanIds, audience.fans).map((fan) =>
      toRecipient(fan, params.message, params.appUrl),
    );
  } catch (err) {
    return { ...NOTHING_SENT, error: `${AUDIENCE_EMAIL_NOT_READ}: ${errorText(err)}` };
  }
  const counts = { ...NOTHING_SENT, chosen, skipped: chosen - recipients.length };
  if (recipients.length === 0) return counts;

  try {
    const batch = await params.send(recipients);
    const sent = batch.outcomes.filter((outcome) => outcome.ok).length;
    return { ...counts, sent, failed: recipients.length - sent, error: batch.error };
  } catch (err) {
    return { ...counts, failed: recipients.length, error: errorText(err) };
  }
}
