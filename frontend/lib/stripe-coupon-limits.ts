/**
 * Limits for admin-created Stripe coupons and promotion codes. Pure so it
 * can be unit tested. The route at app/api/admin/stripe-coupon uses this
 * before anything is sent to Stripe.
 *
 * Rules:
 * - percent_off must be a whole number from 1 to 100.
 * - amount_off is capped at MAX_AMOUNT_OFF_USD.
 * - duration "forever" is refused. A coupon that never ends needs a
 *   documented reason, so it has to be made directly in Stripe.
 * - "repeating" needs duration_months from 1 to MAX_DURATION_MONTHS.
 * - max_redemptions is required and capped at MAX_REDEMPTIONS.
 */

export const MAX_AMOUNT_OFF_USD = 100;
export const MAX_DURATION_MONTHS = 12;
export const MAX_REDEMPTIONS = 1000;
export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export type CouponDuration = "once" | "repeating";

export interface CouponInput {
  promoCode: string;
  discountType: string;
  amount: string;
  duration: string;
  durationMonths: string;
  maxRedemptions: string;
}

export interface ValidCoupon {
  promoCode: string;
  duration: CouponDuration;
  durationInMonths: number | null;
  maxRedemptions: number;
  discount:
    | { kind: "percent"; percentOff: number }
    | { kind: "amount"; amountOffCents: number; currency: "usd" };
}

export type CouponValidation =
  | { ok: true; value: ValidCoupon }
  | { ok: false; error: string };

function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function validateDiscount(
  discountType: string,
  amount: string,
): { ok: true; value: ValidCoupon["discount"] } | { ok: false; error: string } {
  if (discountType === "percent") {
    const pct = parseWholeNumber(amount);
    if (pct === null || pct < 1 || pct > 100) {
      return { ok: false, error: "Percent off must be a whole number from 1 to 100." };
    }
    return { ok: true, value: { kind: "percent", percentOff: pct } };
  }
  if (discountType === "amount") {
    const dollars = parseDecimal(amount);
    if (dollars === null || dollars <= 0 || dollars > MAX_AMOUNT_OFF_USD) {
      return {
        ok: false,
        error: `Amount off must be more than $0 and no more than $${MAX_AMOUNT_OFF_USD}.`,
      };
    }
    return {
      ok: true,
      value: { kind: "amount", amountOffCents: Math.round(dollars * 100), currency: "usd" },
    };
  }
  return { ok: false, error: "Discount type must be percent or amount." };
}

function validateDuration(
  duration: string,
  durationMonths: string,
):
  | { ok: true; duration: CouponDuration; months: number | null }
  | { ok: false; error: string } {
  if (duration === "forever") {
    return {
      ok: false,
      error: "Forever coupons are not allowed here. Use once or repeating.",
    };
  }
  if (duration === "once") return { ok: true, duration: "once", months: null };
  if (duration === "repeating") {
    const months = parseWholeNumber(durationMonths);
    if (months === null || months < 1 || months > MAX_DURATION_MONTHS) {
      return {
        ok: false,
        error: `Repeating coupons need 1 to ${MAX_DURATION_MONTHS} months.`,
      };
    }
    return { ok: true, duration: "repeating", months };
  }
  return { ok: false, error: "Duration must be once or repeating." };
}

export function validateCouponInput(input: CouponInput): CouponValidation {
  const promoCode = input.promoCode.trim().toUpperCase();
  if (!PROMO_CODE_PATTERN.test(promoCode)) {
    return {
      ok: false,
      error: "Promo code must be 3 to 32 letters, numbers, dashes or underscores.",
    };
  }

  const discount = validateDiscount(input.discountType, input.amount);
  if (!discount.ok) return discount;

  const duration = validateDuration(input.duration, input.durationMonths);
  if (!duration.ok) return duration;

  const maxRedemptions = parseWholeNumber(input.maxRedemptions);
  if (maxRedemptions === null || maxRedemptions < 1 || maxRedemptions > MAX_REDEMPTIONS) {
    return {
      ok: false,
      error: `Max redemptions is required, from 1 to ${MAX_REDEMPTIONS}.`,
    };
  }

  return {
    ok: true,
    value: {
      promoCode,
      duration: duration.duration,
      durationInMonths: duration.months,
      maxRedemptions,
      discount: discount.value,
    },
  };
}
