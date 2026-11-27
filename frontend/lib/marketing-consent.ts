import { SMS_CONSENT_TEXT } from "./sms-public-opt-in.ts";

/**
 * Marketing consent wording and versions. Port of Brand Engage Pro's
 * lib/marketing-consent.ts (its #326, #329 and #332).
 *
 * Email and text consent are separate, unticked boxes. When a ticked box
 * arrives, the server stamps the time and the version below on the fan
 * row, so we can show what each fan agreed to and when.
 *
 * Change the wording? Bump the matching version in the same commit.
 */

export const EMAIL_CONSENT_TEXT =
  "Email me artist news, drops, events, and rewards from Fan Engage Pro. " +
  "Unsubscribe any time.";

export const EMAIL_CONSENT_VERSION = "email-2026-11-27.v1";

export { SMS_CONSENT_TEXT };

export const SMS_CONSENT_VERSION = "sms-2026-11-27.v1";

/** The four columns added by migration 0109. */
export const MARKETING_CONSENT_COLUMNS = [
  "email_consent_at",
  "email_consent_version",
  "sms_consent_at",
  "sms_consent_version",
] as const;

export type ConsentStamp = Record<string, string>;

/** Columns to write when the email box was ticked. */
export function emailConsentStamp(now: Date = new Date()): ConsentStamp {
  return {
    email_consent_at: now.toISOString(),
    email_consent_version: EMAIL_CONSENT_VERSION,
  };
}

/** Columns to write when texts were agreed to (join box or settings switch). */
export function smsConsentStamp(now: Date = new Date()): ConsentStamp {
  return {
    sms_consent_at: now.toISOString(),
    sms_consent_version: SMS_CONSENT_VERSION,
  };
}

/**
 * Marketing email goes only to fans with a recorded email consent.
 * email_opted_in alone is not enough: the old join form turned it on for
 * every fan who gave an email, without a tick. Account notices (an event
 * reminder to a fan who RSVPed) are unchanged.
 */
export const MARKETING_EMAIL_CONSENT_COLUMN = "email_consent_at";

export type EmailConsentFields = {
  email_opted_in?: boolean | null;
  email_consent_at?: string | null;
};

export function hasRecordedEmailConsent(fan: EmailConsentFields | null | undefined): boolean {
  return fan?.email_opted_in === true && Boolean(fan.email_consent_at);
}

/** Opted in by the old form with no recorded tick: ask them again in the app. */
export function needsEmailReask(fan: EmailConsentFields | null | undefined): boolean {
  return fan?.email_opted_in === true && !fan.email_consent_at;
}

/**
 * The fan row change when marketing email is turned on or off, from the
 * in-app card or the notification settings switch. On stamps a fresh
 * consent record; off clears the opt-in (the same as the unsubscribe link).
 */
export function emailMarketingUpdates(
  on: boolean,
  now: Date = new Date(),
): Record<string, string | boolean> {
  return on ? { email_opted_in: true, ...emailConsentStamp(now) } : { email_opted_in: false };
}

/** The fan row change for an answer to the in-app question. */
export function emailReaskUpdates(
  agree: boolean,
  now: Date = new Date(),
): Record<string, string | boolean> {
  return emailMarketingUpdates(agree, now);
}

/**
 * The email part of a join form save.
 *
 * - Box ticked: opted in, with a fresh consent record.
 * - Box not ticked, and the fan already has a recorded consent (they are
 *   running the join form again): nothing changes. The form is not the
 *   place to withdraw; the settings switch and the unsubscribe link are.
 * - Box not ticked otherwise: not opted in. This is what stops the old
 *   behaviour of opting in every fan who gave an email.
 */
export function emailJoinUpdates(
  ticked: boolean,
  existing: EmailConsentFields | null | undefined,
  now: Date = new Date(),
): Record<string, string | boolean> {
  if (ticked) return emailMarketingUpdates(true, now);
  if (hasRecordedEmailConsent(existing)) return {};
  return { email_opted_in: false };
}

type PostgrestLikeError = { message?: string; code?: string } | null | undefined;

/** True when the write or read failed because migration 0109 is not applied. */
export function isMissingMarketingConsentColumn(error: PostgrestLikeError): boolean {
  if (!error) return false;
  const blob = `${error.code ?? ""} ${error.message ?? ""}`;
  return MARKETING_CONSENT_COLUMNS.some((column) => blob.includes(column));
}

/** The same update without the 0109 columns, for a database that lacks them. */
export function omitMarketingConsent<T extends Record<string, unknown>>(updates: T): T {
  const next: Record<string, unknown> = { ...updates };
  for (const column of MARKETING_CONSENT_COLUMNS) delete next[column];
  return next as T;
}
