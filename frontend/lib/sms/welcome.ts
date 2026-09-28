import { isE164 } from "../phone.ts";

/**
 * Fixed wording for the onboarding confirmation text. Server-side only:
 * nothing the client sends is ever placed in the message body.
 */
export const SMS_WELCOME_MESSAGE =
  "Welcome to Fan Engage! Earn your first 100 pts: follow an artist, " +
  "RSVP to an event, or share the app. Reply HELP for help. STOP to opt out. " +
  "Msg&data rates may apply.";

export type SmsRecipientFan = {
  phone: string | null;
  sms_opted_in: boolean | null;
};

export type SmsRecipientResult =
  | { ok: true; phone: string }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Decide whether the signed-in fan's own stored number may be texted.
 * Requires a recorded SMS opt-in and a stored E.164 number.
 */
export function smsRecipientForFan(fan: SmsRecipientFan | null): SmsRecipientResult {
  if (!fan || fan.sms_opted_in !== true) {
    return { ok: false, status: 403, error: "SMS consent is required before we can text you." };
  }
  const phone = fan.phone?.trim() ?? "";
  if (!isE164(phone)) {
    return { ok: false, status: 400, error: "Add a valid phone number to your profile first." };
  }
  return { ok: true, phone };
}
