import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateInfluencerPromo } from "./influencer-promo-limits.ts";

describe("validateInfluencerPromo", () => {
  it("accepts percent and fixed amount codes", () => {
    const r = validateInfluencerPromo({ discountType: "percent", discountValue: "15", maxRedemptions: "" });
    assert.deepEqual(r, { ok: true, value: { discountType: "percent", discountValue: 15, maxRedemptions: null } });
    const f = validateInfluencerPromo({ discountType: "fixed_amount", discountValue: 500, maxRedemptions: 20 });
    assert.equal(f.ok, true);
  });

  it("keeps percent discounts from 1 to 100", () => {
    assert.equal(validateInfluencerPromo({ discountType: "percent", discountValue: 101, maxRedemptions: null }).ok, false);
    assert.equal(validateInfluencerPromo({ discountType: "percent", discountValue: 0, maxRedemptions: null }).ok, false);
    assert.equal(validateInfluencerPromo({ discountType: "percent", discountValue: 100, maxRedemptions: null }).ok, true);
  });

  it("refuses unknown types, non whole numbers and bad redemption limits", () => {
    assert.equal(validateInfluencerPromo({ discountType: "free", discountValue: 1, maxRedemptions: null }).ok, false);
    assert.equal(validateInfluencerPromo({ discountType: "percent", discountValue: "1.5", maxRedemptions: null }).ok, false);
    assert.equal(validateInfluencerPromo({ discountType: "percent", discountValue: -3, maxRedemptions: null }).ok, false);
    assert.equal(validateInfluencerPromo({ discountType: "percent", discountValue: 5, maxRedemptions: 0 }).ok, false);
    assert.equal(validateInfluencerPromo({ discountType: "percent", discountValue: 5, maxRedemptions: "abc" }).ok, false);
  });
});
