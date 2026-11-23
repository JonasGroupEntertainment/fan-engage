import { smsTextOptIn } from "../age-gate.ts";

/**
 * Send-time age rule. Same decision as text opt-in:
 * 18 and older may receive texts, a fan with no birth date is not blocked,
 * and ages 13 to 17 may receive texts only when sms_parent_consent_at is set.
 * Under 13 is refused.
 */
export function smsAgeAllowsSend(
  birthDate: string | null | undefined,
  now: Date = new Date(),
  smsParentConsentAt?: string | null,
): boolean {
  return smsTextOptIn({
    birthDate,
    requested: true,
    smsParentConsent: Boolean(smsParentConsentAt),
    now,
  }).accept;
}

/** True when a query failed because 0108 has not been applied yet. */
export function isMissingSmsParentConsentColumn(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const blob = `${error.code ?? ""} ${error.message ?? ""}`;
  return blob.includes("sms_parent_consent_at");
}

/** 10DLC footer. Skipped when the body already mentions STOP. */
export function withStopFooter(body: string): string {
  if (body.toUpperCase().includes("STOP")) return body;
  return `${body} Reply STOP to opt out.`;
}
