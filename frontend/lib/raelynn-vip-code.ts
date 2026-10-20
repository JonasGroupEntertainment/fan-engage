/**
 * Hard cap for the RAELYNNVIP complimentary code.
 *
 * The database row carries the same redemption limits (migration 0076)
 * and the 7-day access window (migration 0078). Redeem still applies
 * these constants so a missing or looser row cannot exceed 10 uses,
 * stay valid past the end of 2026-12-31 UTC, or grant open-ended
 * access. Existing redemption rows, including tests, count toward
 * the cap and are not deleted. Fans who already redeemed keep the
 * open-ended comp they were given; this module does not rewrite them.
 */

export const RAELYNN_VIP_CODE = "RAELYNNVIP";
export const RAELYNN_VIP_MAX_USES = 10;
/** Complimentary access from a new redemption. Not an open-ended plan. */
export const RAELYNN_VIP_ACCESS_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Days of access a redemption grants. Null means the code stays open-ended. */
export function promoAccessDays(code: string): number | null {
  return code.trim().toUpperCase() === RAELYNN_VIP_CODE ? RAELYNN_VIP_ACCESS_DAYS : null;
}

export type PromoGrant = {
  /**
   * When access ends. Null is an open-ended comp: redeem writes null
   * into current_period_end so a leftover paid period cannot expire it.
   */
  currentPeriodEnd: string | null;
  accessDays: number | null;
};

/**
 * New RAELYNNVIP redemptions end 7×24 hours after redeem. Other codes
 * are unchanged. This does not describe fans who already redeemed:
 * their membership rows are left alone.
 */
export function promoGrant(code: string, redeemedAt: Date): PromoGrant {
  const accessDays = promoAccessDays(code);
  if (accessDays == null) {
    return { currentPeriodEnd: null, accessDays: null };
  }
  return {
    accessDays,
    currentPeriodEnd: new Date(redeemedAt.getTime() + accessDays * DAY_MS).toISOString(),
  };
}

export function redeemSuccessMessage(input: {
  description: string | null;
  grant: PromoGrant;
}): string {
  const label = input.description ?? "premium access";
  if (input.grant.accessDays != null && input.grant.currentPeriodEnd) {
    return `Code applied! You have ${input.grant.accessDays} days of complimentary ${label}, until ${formatGrantEnd(input.grant.currentPeriodEnd)}.`;
  }
  return `Code applied! You now have complimentary ${label}.`;
}

function formatGrantEnd(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm} UTC`;
}
