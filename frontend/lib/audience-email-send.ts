import type { TransactionalBatchResult, TransactionalRecipient } from "./email/transactional.ts";
import { buildAudienceEmail, type AudienceMessage } from "./audience-email.ts";
import { selectReminderEmailRecipients, type ReminderFanRow } from "./event-reminder-email.ts";
import { outOfTime } from "./send-budget.ts";

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
 * Recipients go to the provider a chunk at a time. When a deadline is
 * given and it has passed, no new chunk is started; the fans left over
 * are counted in `notSent` so the admin is told the send stopped early.
 *
 * Relative imports and injected reads / sends, so it runs under node --test.
 */

export const AUDIENCE_EMAIL_NOT_READ = "could not read the chosen fans";

/**
 * Recipients handed to the provider between deadline checks. With 5 in
 * flight and a 10 second limit each, one chunk takes at most 20 seconds.
 */
export const EMAIL_SEND_CHUNK = 10;

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
  /** Fans who may be emailed but were never tried: the send ran out of time. */
  notSent: number;
  /** A failure that stopped the read or a whole chunk of sends. */
  error: string | null;
};

const NOTHING_SENT: AudienceEmailResult = {
  configured: true,
  chosen: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  notSent: 0,
  error: null,
};

type ChunkTally = { sent: number; failed: number; error: string | null };

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** One chunk. A throw fails that chunk only. */
async function sendChunk(
  chunk: readonly TransactionalRecipient[],
  send: (recipients: readonly TransactionalRecipient[]) => Promise<TransactionalBatchResult>,
): Promise<ChunkTally> {
  try {
    const batch = await send(chunk);
    const sent = batch.outcomes.filter((outcome) => outcome.ok).length;
    return { sent, failed: chunk.length - sent, error: batch.error };
  } catch (err) {
    return { sent: 0, failed: chunk.length, error: errorText(err) };
  }
}

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
  /** Epoch ms after which no new chunk is started. Omit for no limit. */
  deadlineAt?: number | null;
  /** Test seam for the clock. */
  now?: () => number;
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

  const now = params.now ?? Date.now;
  let tally: ChunkTally = { sent: 0, failed: 0, error: null };
  for (const chunk of chunksOf(recipients, EMAIL_SEND_CHUNK)) {
    if (outOfTime(params.deadlineAt, now())) break;
    const done = await sendChunk(chunk, params.send);
    tally = { sent: tally.sent + done.sent, failed: tally.failed + done.failed, error: tally.error ?? done.error };
  }
  return { ...counts, ...tally, notSent: recipients.length - tally.sent - tally.failed };
}
