/**
 * Checks on the join form's request body, before anything is saved, and the
 * rule for when a join counts as finished.
 */

export type OnboardPayload = {
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  phone?: string | null;
  handle?: string | null;
  musicOutlet?: string | null;
  interest?: string | null;
  /** Optional: the ref code that was passed in the invite link. */
  referralCode?: string | null;
  /** Optional: artist/community slug the fan joined through. */
  communitySlug?: string | null;
  smsOptedIn?: boolean | null;
  /** True only when the fan ticked the SMS consent box. */
  smsConsent?: boolean | null;
  /** Separate parent tick for a fan aged 13 to 17. Not the join tick. */
  smsParentConsent?: boolean | null;
  /** Ignored. The old form sent true for every fan who gave an email. */
  emailOptedIn?: boolean | null;
  /** True only when the fan ticked the marketing email box. */
  emailConsent?: boolean | null;
  /** When the fan ticked the Terms box (client clock, validated later). */
  consentAcceptedAt?: string | null;
};

const TEXT_FIELDS: readonly (keyof OnboardPayload)[] = [
  "firstName",
  "lastName",
  "city",
  "phone",
  "handle",
  "musicOutlet",
  "interest",
  "referralCode",
  "communitySlug",
  "consentAcceptedAt",
];

const TICK_FIELDS: readonly (keyof OnboardPayload)[] = [
  "smsOptedIn",
  "smsConsent",
  "smsParentConsent",
  "emailOptedIn",
  "emailConsent",
];

export const ONBOARD_BAD_REQUEST_ERROR =
  "We could not read that. Please reload the page and try again.";
export const ONBOARD_BAD_FIELD_ERROR =
  "Something in the form was not filled in the right way. Please check it and try again.";

export type OnboardPayloadCheck =
  | { ok: true; payload: OnboardPayload }
  | { ok: false; error: string };

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

/** Every field has the right type. Lengths are checked separately. */
export function validateOnboardPayload(raw: unknown): OnboardPayloadCheck {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: ONBOARD_BAD_REQUEST_ERROR };
  }
  const fields = raw as Record<string, unknown>;
  const badText = TEXT_FIELDS.some(
    (key) => !isAbsent(fields[key]) && typeof fields[key] !== "string",
  );
  const badTick = TICK_FIELDS.some(
    (key) => !isAbsent(fields[key]) && typeof fields[key] !== "boolean",
  );
  if (badText || badTick) return { ok: false, error: ONBOARD_BAD_FIELD_ERROR };
  return { ok: true, payload: raw as OnboardPayload };
}

/**
 * A join is finished once the fan's saved record has a name and the time
 * they agreed to the Terms. Welcome points, the referral reward and the
 * founding number wait for that. An earlier save (the text confirmation
 * step) keeps the details and nothing more.
 */
export function isJoinComplete(saved: {
  firstName?: string | null;
  consentAcceptedAt?: string | null;
}): boolean {
  const hasName = typeof saved.firstName === "string" && saved.firstName.trim() !== "";
  const agreed =
    typeof saved.consentAcceptedAt === "string" && saved.consentAcceptedAt.trim() !== "";
  return hasName && agreed;
}
