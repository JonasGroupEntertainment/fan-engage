/** Shared empty-phone gate for confirmation SMS — never send to a blank number. */

export const EMPTY_PHONE_SMS_MESSAGE =
  "Add a phone number to send a confirmation text.";

export function normalizeSmsPhone(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function hasSendablePhone(phone: string | null | undefined): boolean {
  return normalizeSmsPhone(phone) != null;
}

export function smsSendBlockedReason(phone: string | null | undefined): string | null {
  return hasSendablePhone(phone) ? null : EMPTY_PHONE_SMS_MESSAGE;
}
