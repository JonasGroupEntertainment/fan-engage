/**
 * Hard cap for the RAELYNNVIP complimentary code.
 *
 * The database row carries the same limits (migration 0076). Redeem
 * still applies these constants so a missing or looser row cannot
 * exceed 10 uses or stay valid past the end of 2026-12-31 UTC.
 * Existing redemption rows, including tests, count toward the cap
 * and are not deleted.
 */

export const RAELYNN_VIP_CODE = "RAELYNNVIP";
export const RAELYNN_VIP_MAX_USES = 10;

/** Last instant the code is still valid. */
export const RAELYNN_VIP_EXPIRES_AT = "2026-12-31T23:59:59.999Z";

const RAELYNN_VIP_EXPIRES_AT_MS = Date.parse(RAELYNN_VIP_EXPIRES_AT);

export type PromoLimitInput = {
  code: string;
  maxUses: number | null;
  expiresAt: string | null;
};

export type PromoLimits = {
  maxUses: number | null;
  expiresAt: string | null;
  /** Count redemption rows so a stale uses_count cannot exceed the cap. */
  countRedemptions: boolean;
};

export function effectivePromoLimits(input: PromoLimitInput): PromoLimits {
  const code = input.code.trim().toUpperCase();
  if (code !== RAELYNN_VIP_CODE) {
    return {
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      countRedemptions: false,
    };
  }

  const maxUses =
    input.maxUses == null
      ? RAELYNN_VIP_MAX_USES
      : Math.min(input.maxUses, RAELYNN_VIP_MAX_USES);

  let expiresMs = RAELYNN_VIP_EXPIRES_AT_MS;
  if (input.expiresAt) {
    const stored = Date.parse(input.expiresAt);
    if (!Number.isNaN(stored)) {
      expiresMs = Math.min(stored, RAELYNN_VIP_EXPIRES_AT_MS);
    }
  }

  return {
    maxUses,
    expiresAt: new Date(expiresMs).toISOString(),
    countRedemptions: true,
  };
}

export function promoLimitReached(used: number, maxUses: number | null): boolean {
  return maxUses !== null && used >= maxUses;
}

export function promoExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false;
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) return true;
  return expiresMs < now.getTime();
}
