import { normalizePhoneE164 } from "./phone.ts";

/**
 * Exact SMS consent disclosure required for the US texting-number review.
 * "Terms" links to /terms and "Privacy Policy" links to /privacy.
 */
export const SMS_CONSENT_TEXT =
  "Yes, text me about artist drops, events, meet and greets, and rewards from Fan Engage Pro. Message frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Consent is not a condition of purchase. See our Terms and Privacy Policy.";

export type PublicSmsOptIn = {
  /** E.164 phone, or null when the field was left blank. */
  phone: string | null;
  /** True only when the box is ticked AND a phone number was stored. */
  smsOptedIn: boolean;
  /** Set when the visitor typed something that is not a usable phone. */
  error: string | null;
};

/**
 * Phone and SMS consent are optional. A blank phone is valid and does not
 * opt the fan in, even if the box is ticked. A non-blank phone must
 * normalize; the box has no effect without that number.
 */
export function publicSmsOptIn(
  consentChecked: boolean,
  phoneInput: string | null | undefined,
): PublicSmsOptIn {
  const normalized = normalizePhoneE164(phoneInput);
  if (!normalized.ok) {
    return { phone: null, smsOptedIn: false, error: normalized.error };
  }
  return {
    phone: normalized.phone,
    smsOptedIn: consentChecked === true && normalized.phone != null,
    error: null,
  };
}
