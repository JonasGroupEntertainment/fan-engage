/**
 * Shared E.164 phone normalization for every place a fan's phone is written:
 * the onboard route, the profile action, and the SMS route.
 *
 * Phone is optional everywhere, so blank input is accepted and stored as null.
 * Anything non-blank must normalize to E.164 (+ country code, up to 15 digits)
 * so Twilio and phone-based lookups always see one canonical shape.
 */

export const INVALID_PHONE_MESSAGE =
  "Enter a valid phone number with area code, like +1 (615) 555-0123.";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const SEPARATORS_PATTERN = /[\s().-]/g;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const US_COUNTRY_CODE = "1";
const US_NATIONAL_LENGTH = 10;
const US_WITH_COUNTRY_CODE_LENGTH = 11;
// NANP area codes and exchange codes never start with 0 or 1.
const US_NATIONAL_PATTERN = /^[2-9]\d{2}[2-9]\d{6}$/;

export type PhoneNormalization =
  | { ok: true; phone: string | null }
  | { ok: false; error: string };

const rejected: PhoneNormalization = { ok: false, error: INVALID_PHONE_MESSAGE };

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

function acceptIfE164(candidate: string): PhoneNormalization {
  return isE164(candidate) ? { ok: true, phone: candidate } : rejected;
}

function normalizeNationalDigits(digits: string): PhoneNormalization {
  if (digits.length === US_NATIONAL_LENGTH) {
    if (!US_NATIONAL_PATTERN.test(digits)) return rejected;
    return acceptIfE164(`+${US_COUNTRY_CODE}${digits}`);
  }
  if (
    digits.length === US_WITH_COUNTRY_CODE_LENGTH &&
    digits.startsWith(US_COUNTRY_CODE)
  ) {
    return normalizeNationalDigits(digits.slice(US_COUNTRY_CODE.length));
  }
  return rejected;
}

/**
 * Turns user input into an E.164 string.
 * - blank input returns { ok: true, phone: null } because phone is optional
 * - spaces, dots, dashes, and parentheses are stripped
 * - a leading "00" international prefix becomes "+"
 * - 10 US digits, or 11 digits starting with 1, get a +1 prefix
 * - anything else that is not already E.164 is rejected with INVALID_PHONE_MESSAGE
 */
export function normalizePhoneE164(
  input: string | null | undefined,
): PhoneNormalization {
  const trimmed = input?.trim() ?? "";
  if (trimmed.length === 0) return { ok: true, phone: null };

  const stripped = trimmed.replace(SEPARATORS_PATTERN, "");
  const candidate = stripped.startsWith("00") ? `+${stripped.slice(2)}` : stripped;

  if (candidate.startsWith("+")) return acceptIfE164(candidate);
  if (!DIGITS_ONLY_PATTERN.test(candidate)) return rejected;
  return normalizeNationalDigits(candidate);
}
