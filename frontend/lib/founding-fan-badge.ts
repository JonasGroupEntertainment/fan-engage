import { isFoundingFanNumber } from "./points/economy.ts";

/** Both slugs exist in prod history; award + display must treat them as one badge. */
export const FOUNDING_FAN_BADGE_SLUGS = ["founding-fan", "founder-fan"] as const;

export type FoundingFanBadgeSlug = (typeof FOUNDING_FAN_BADGE_SLUGS)[number];

export function isFoundingFanBadgeSlug(slug: string): slug is FoundingFanBadgeSlug {
  return (FOUNDING_FAN_BADGE_SLUGS as readonly string[]).includes(slug);
}

/**
 * Founding Fan is a free first-100 join badge. Unlock from
 * `founding_fan_number` 1–100 — never from paid Premium.
 */
export function foundingFanBadgeEarned(opts: {
  slug: string;
  alreadyEarned: boolean;
  foundingFanNumber: number | null | undefined;
}): boolean {
  if (opts.alreadyEarned) return true;
  if (!isFoundingFanBadgeSlug(opts.slug)) return false;
  return isFoundingFanNumber(opts.foundingFanNumber);
}
