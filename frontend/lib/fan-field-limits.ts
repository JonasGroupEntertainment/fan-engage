/**
 * How long each piece of text a fan can save may be. The same limits are
 * held by the database (migration 0113), so the app checks first and can
 * say which field is too long. Port of Brand Engage Pro's
 * lib/member-field-limits.ts. Pure module, no "@/" imports.
 */

export const FAN_FIELD_LIMITS = {
  firstName: 50,
  lastName: 50,
  city: 80,
  interest: 120,
  musicOutlet: 80,
  /** Stored inside socials, which is limited to 2,000 characters as JSON. */
  instagramOrTiktok: 100,
  deliveryDetails: 500,
  challengeEntry: 1000,
} as const;

export type FanField = keyof typeof FAN_FIELD_LIMITS;

const LABELS: Record<FanField, string> = {
  firstName: "First name",
  lastName: "Last name",
  city: "City",
  interest: "What you are into",
  musicOutlet: "Where you listen",
  instagramOrTiktok: "Instagram or TikTok",
  deliveryDetails: "Delivery details",
  challengeEntry: "Your entry",
};

export type OverLimit = { field: FanField; message: string };

export function tooLongMessage(field: FanField): string {
  return `${LABELS[field]} can be up to ${FAN_FIELD_LIMITS[field]} characters. Please shorten it.`;
}

/** The first field that is over its limit, or null when every one fits. */
export function overLimitField(
  values: Partial<Record<FanField, string | null | undefined>>,
): OverLimit | null {
  for (const field of Object.keys(FAN_FIELD_LIMITS) as FanField[]) {
    const value = values[field];
    if (typeof value === "string" && value.length > FAN_FIELD_LIMITS[field]) {
      return { field, message: tooLongMessage(field) };
    }
  }
  return null;
}
