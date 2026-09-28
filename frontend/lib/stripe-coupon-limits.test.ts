import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_AMOUNT_OFF_USD,
  MAX_DURATION_MONTHS,
  MAX_REDEMPTIONS,
  validateCouponInput,
  type CouponInput,
} from "./stripe-coupon-limits.ts";

const base: CouponInput = {
  promoCode: "fan-10",
  discountType: "percent",
  amount: "10",
  duration: "once",
  durationMonths: "",
  maxRedemptions: "100",
};

function errorOf(input: Partial<CouponInput>): string {
  const r = validateCouponInput({ ...base, ...input });
  assert.equal(r.ok, false);
  return r.ok ? "" : r.error;
}

describe("validateCouponInput", () => {
  it("accepts a valid percent coupon and upper-cases the code", () => {
    const r = validateCouponInput(base);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.promoCode, "FAN-10");
    assert.deepEqual(r.value.discount, { kind: "percent", percentOff: 10 });
    assert.equal(r.value.maxRedemptions, 100);
    assert.equal(r.value.duration, "once");
  });

  it("keeps percent_off from 1 to 100", () => {
    assert.match(errorOf({ amount: "0" }), /1 to 100/);
    assert.match(errorOf({ amount: "101" }), /1 to 100/);
    assert.match(errorOf({ amount: "12.5" }), /1 to 100/);
    assert.equal(validateCouponInput({ ...base, amount: "100" }).ok, true);
    assert.equal(validateCouponInput({ ...base, amount: "1" }).ok, true);
  });

  it("caps amount_off", () => {
    const ok = validateCouponInput({ ...base, discountType: "amount", amount: "25.50" });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.deepEqual(ok.value.discount, { kind: "amount", amountOffCents: 2550, currency: "usd" });
    assert.equal(
      validateCouponInput({ ...base, discountType: "amount", amount: String(MAX_AMOUNT_OFF_USD) }).ok,
      true,
    );
    assert.match(errorOf({ discountType: "amount", amount: String(MAX_AMOUNT_OFF_USD + 1) }), /no more than/);
    assert.match(errorOf({ discountType: "amount", amount: "0" }), /more than \$0/);
    assert.match(errorOf({ discountType: "amount", amount: "-5" }), /Amount off/);
  });

  it("refuses forever coupons", () => {
    assert.match(errorOf({ duration: "forever" }), /Forever coupons are not allowed/);
  });

  it("limits repeating coupons to a set number of months", () => {
    assert.equal(validateCouponInput({ ...base, duration: "repeating", durationMonths: "3" }).ok, true);
    assert.match(errorOf({ duration: "repeating", durationMonths: "" }), /months/);
    assert.match(errorOf({ duration: "repeating", durationMonths: String(MAX_DURATION_MONTHS + 1) }), /months/);
  });

  it("requires and caps max_redemptions", () => {
    assert.match(errorOf({ maxRedemptions: "" }), /Max redemptions is required/);
    assert.match(errorOf({ maxRedemptions: "0" }), /Max redemptions/);
    assert.match(errorOf({ maxRedemptions: String(MAX_REDEMPTIONS + 1) }), /Max redemptions/);
    assert.equal(validateCouponInput({ ...base, maxRedemptions: String(MAX_REDEMPTIONS) }).ok, true);
  });

  it("refuses bad promo codes and unknown discount types", () => {
    assert.match(errorOf({ promoCode: "a" }), /Promo code/);
    assert.match(errorOf({ promoCode: "HAS SPACE" }), /Promo code/);
    assert.match(errorOf({ discountType: "free" }), /Discount type/);
  });
});
