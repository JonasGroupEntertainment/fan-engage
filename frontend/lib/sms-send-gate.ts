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

/**
 * Onboarding records the fan's text consent on fans.sms_opted_in, but the
 * notification dispatcher reads notification_preferences.sms_enabled. Both
 * must agree or opted-in fans never get a text. Tier gating still happens
 * at send time in lib/notifications/sms.ts.
 */
export function smsEnabledFromOnboarding(
  smsOptedIn: boolean | undefined,
  phone: string | null | undefined,
): boolean {
  return smsOptedIn === true && hasSendablePhone(phone);
}

/**
 * The reverse of smsEnabledFromOnboarding: the settings SMS switch writes
 * notification_preferences.sms_enabled, but the senders also require
 * fans.sms_opted_in. Returns the value to store on fans.sms_opted_in, or
 * null to leave it alone. A switch-off always revokes consent. A switch-on
 * only records consent when the tier allows SMS and a phone is on file, so
 * a tier-coerced false never wipes consent given at onboarding.
 */
export function smsOptInFromSettings(
  requested: boolean | undefined,
  tierAllowsSms: boolean,
  phone: string | null | undefined,
): boolean | null {
  if (requested === false) return false;
  if (requested !== true || !tierAllowsSms) return null;
  return hasSendablePhone(phone) ? true : null;
}

const SMS_TIER_RANK: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  founder: 3,
};

/** SMS alerts are reserved for Gold and up. */
export function smsTierAllowed(tier: string | null | undefined): boolean {
  return (SMS_TIER_RANK[tier ?? "bronze"] ?? 0) >= SMS_TIER_RANK.gold;
}

/**
 * Decide what the settings SMS switch should store. Below Gold the switch
 * can only be turned off, never on, so a locked switch keeps whatever
 * onboarding stored. `changed` tells the caller whether fans.sms_opted_in
 * needs to follow, so saving other toggles never touches SMS consent.
 */
export function resolveSmsSwitch(
  requested: boolean,
  stored: boolean,
  tierAllowsSms: boolean,
): { smsEnabled: boolean; changed: boolean } {
  const smsEnabled = tierAllowsSms ? requested : requested && stored;
  return { smsEnabled, changed: smsEnabled !== stored };
}
