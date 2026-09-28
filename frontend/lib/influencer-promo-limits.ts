/**
 * Limits for influencer promo codes (stored in influencer_promo_codes and
 * applied at checkout). Pure so it can be unit tested and shared by the
 * server action and the admin API route.
 */
export const INFLUENCER_DISCOUNT_TYPES = ["percent", "fixed_amount"] as const;
export type InfluencerDiscountType = (typeof INFLUENCER_DISCOUNT_TYPES)[number];

export type InfluencerPromoInput = {
  discountType: unknown;
  discountValue: unknown;
  maxRedemptions: unknown;
};

export type InfluencerPromoResult =
  | {
      ok: true;
      value: {
        discountType: InfluencerDiscountType;
        discountValue: number;
        maxRedemptions: number | null;
      };
    }
  | { ok: false; error: string };

function toInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export function validateInfluencerPromo(input: InfluencerPromoInput): InfluencerPromoResult {
  const type = input.discountType;
  if (type !== "percent" && type !== "fixed_amount") {
    return { ok: false, error: "Discount type must be percent or fixed amount." };
  }
  const value = toInt(input.discountValue);
  if (value === null || value < 1) {
    return { ok: false, error: "Discount value must be a whole number of at least 1." };
  }
  if (type === "percent" && value > 100) {
    return { ok: false, error: "A percent discount cannot be more than 100." };
  }
  const raw = input.maxRedemptions;
  let maxRedemptions: number | null = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    maxRedemptions = toInt(raw);
    if (maxRedemptions === null || maxRedemptions < 1) {
      return { ok: false, error: "Max redemptions must be a whole number of at least 1." };
    }
  }
  return { ok: true, value: { discountType: type, discountValue: value, maxRedemptions } };
}
