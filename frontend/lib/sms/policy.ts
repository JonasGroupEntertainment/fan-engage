import { adultGate } from "../age-gate.ts";

/**
 * Send-time age rule. Matches the fans trigger in 0070_age_check.sql:
 * a known under-18 birth date cannot be texted, and a fan with no birth
 * date on file keeps a prior opt-in (grandfathered). Callers still require
 * sms_opted_in, so an unknown birth date with no opt-in never reaches here
 * as a yes.
 */
export function smsAgeAllowsSend(
  birthDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return adultGate(birthDate ?? null, now) !== "adult_only";
}

/** 10DLC footer. Skipped when the body already mentions STOP. */
export function withStopFooter(body: string): string {
  if (body.toUpperCase().includes("STOP")) return body;
  return `${body} Reply STOP to opt out.`;
}
