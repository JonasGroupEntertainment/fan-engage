/**
 * The Terms of Service and Privacy Policy version a fan agrees to.
 *
 * Every place that records consent (signup, onboarding) must use this one
 * constant so fans.consent_version always matches the published documents.
 * Bump it when the published Terms or Privacy Policy change.
 */
export const CONSENT_VERSION = "2026-08-01.v1";

/**
 * Parse a client-supplied consent time. Returns a normalized ISO string
 * only for a real timestamp that is not in the future (small clock skew
 * allowed); anything else returns null. Never invents a time.
 */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function parseConsentTimestamp(
  value: unknown,
  now: Date = new Date(),
): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  if (ms > now.getTime() + MAX_CLOCK_SKEW_MS) return null;
  return new Date(ms).toISOString();
}

export type OnboardConsentInput = {
  smsOptedIn?: unknown;
  smsConsent?: unknown;
  consentAcceptedAt?: unknown;
};

export type OnboardConsentUpdates =
  | {
      ok: true;
      smsOptedIn: boolean;
      /** Present only when the fan ticked the Terms box this submission. */
      consent?: { consent_accepted_at: string; consent_version: string };
    }
  | { ok: false; error: string };

/**
 * Server-side consent rules for the onboard route.
 *
 * - SMS opt-in needs the ticked SMS consent box (smsConsent === true) AND a
 *   stored phone. A bare smsOptedIn flag is not enough.
 * - The Terms consent time is the one the client recorded when the box was
 *   ticked. A malformed or future time is rejected; a missing one leaves
 *   the stored consent untouched. The server never invents a time.
 * - The version is always the server's CONSENT_VERSION, never the client's.
 */
export function onboardConsentUpdates(
  input: OnboardConsentInput,
  phone: string | null,
  now: Date = new Date(),
): OnboardConsentUpdates {
  const hasPhone = typeof phone === "string" && phone.trim() !== "";
  const smsOptedIn = input.smsConsent === true && input.smsOptedIn === true && hasPhone;

  if (input.consentAcceptedAt === undefined || input.consentAcceptedAt === null) {
    return { ok: true, smsOptedIn };
  }
  const acceptedAt = parseConsentTimestamp(input.consentAcceptedAt, now);
  if (!acceptedAt) {
    return { ok: false, error: "Consent time is missing or invalid. Please tick the box again." };
  }
  return {
    ok: true,
    smsOptedIn,
    consent: { consent_accepted_at: acceptedAt, consent_version: CONSENT_VERSION },
  };
}
