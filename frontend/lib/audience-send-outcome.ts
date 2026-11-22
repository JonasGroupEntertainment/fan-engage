/**
 * What an admin send did (Broadcast screen, campaign builder), in the
 * plain words the admin sees afterwards, one line per channel. Also the
 * short window in which an identical send is refused.
 *
 * Pure: no env, no Supabase, no imports.
 */

const MINUTE_MS = 60 * 1000;
const DUPLICATE_SEND_WINDOW_MINUTES = 5;

/** An identical send inside this window is refused (double click, retry). */
export const DUPLICATE_SEND_WINDOW_MS = DUPLICATE_SEND_WINDOW_MINUTES * MINUTE_MS;

export const DUPLICATE_BROADCAST_MESSAGE = `This same message was already sent to these fans in the last ${DUPLICATE_SEND_WINDOW_MINUTES} minutes, so it was not sent again. Wait a few minutes if you mean to send it again.`;

export const DUPLICATE_CAMPAIGN_MESSAGE = `A campaign with this title was already published for this artist in the last ${DUPLICATE_SEND_WINDOW_MINUTES} minutes, so this one was not published again. Check the campaigns list before trying again.`;

export function duplicateSendCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - DUPLICATE_SEND_WINDOW_MS).toISOString();
}

export type EmailOutcome = {
  /** False when the per-fan mail key is missing. */
  configured: boolean;
  /** Fans the admin chose. */
  chosen: number;
  sent: number;
  failed: number;
  /** Chosen fans who may not be emailed. */
  skipped: number;
  error: string | null;
};

export type SmsOutcome = {
  /** Chosen fans who have opted in to texts. */
  recipients: number;
  sent: number;
  failed: number;
  error?: string | null;
};

export type AudienceSendOutcome = {
  email?: EmailOutcome;
  sms?: SmsOutcome;
  /** Fans given an in-app notice. */
  inApp?: number;
};

export function describeEmailOutcome(email: EmailOutcome): string {
  if (!email.configured) {
    return "Email is not set up yet (the mail key is missing), so no emails were sent.";
  }
  if (email.chosen === 0) {
    return email.error
      ? "No emails were sent because the list of fans could not be read. Please try again."
      : "Email: no fans matched your choice, so no emails were sent.";
  }
  return `Email: ${email.sent} sent, ${email.skipped} skipped because they have not opted in or cannot be emailed, ${email.failed} failed.`;
}

export function describeSmsOutcome(sms: SmsOutcome): string {
  if (sms.error && sms.sent === 0) return `No texts were sent: ${sms.error}`;
  if (sms.recipients === 0) {
    return "Texts: none of the chosen fans have opted in to texts, so none were sent.";
  }
  return `Texts: ${sms.sent} sent, ${sms.failed} failed.`;
}

export function describeInAppOutcome(fans: number): string {
  return `In-app notice: ${fans} fan${fans === 1 ? "" : "s"}.`;
}

/** One line per channel that was asked for. `ok` is false when nothing went out. */
export function describeAudienceSend(outcome: AudienceSendOutcome): { ok: boolean; lines: string[] } {
  const { email, sms, inApp } = outcome;
  const lines = [
    ...(email ? [describeEmailOutcome(email)] : []),
    ...(sms ? [describeSmsOutcome(sms)] : []),
    ...(inApp === undefined ? [] : [describeInAppOutcome(inApp)]),
  ];
  const reached = (email?.sent ?? 0) + (sms?.sent ?? 0) + (inApp ?? 0);
  return { ok: reached > 0, lines };
}
