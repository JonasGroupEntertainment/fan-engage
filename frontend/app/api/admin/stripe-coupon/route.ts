import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin, guardStatus } from "@/lib/admin-guard";
import { getStripe } from "@/lib/stripe";
import { validateCouponInput } from "@/lib/stripe-coupon-limits";

/**
 * Create a Stripe coupon and promotion code. Super-admins only: a coupon
 * applies across the whole Stripe account, not one artist community.
 */
export async function POST(req: NextRequest) {
  const guard = await authorizeAdmin({ superAdminOnly: true });
  if (!guard.ok) {
    return NextResponse.json(
      { ok: false, error: guard.reason === "signed_out" ? "Unauthorized" : "Forbidden" },
      { status: guardStatus(guard.reason) },
    );
  }

  const fd = await req.formData();
  const field = (name: string) => (fd.get(name) ?? "").toString();
  const checked = validateCouponInput({
    promoCode: field("promo_code"),
    discountType: field("discount_type") || "percent",
    amount: field("amount"),
    duration: field("duration") || "once",
    durationMonths: field("duration_months"),
    maxRedemptions: field("max_redemptions"),
  });
  if (!checked.ok) {
    return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
  }
  const coupon = checked.value;

  try {
    const stripe = getStripe();

    const couponParams: Parameters<typeof stripe.coupons.create>[0] = {
      duration: coupon.duration,
      ...(coupon.duration === "repeating" && coupon.durationInMonths
        ? { duration_in_months: coupon.durationInMonths }
        : {}),
      max_redemptions: coupon.maxRedemptions,
      ...(coupon.discount.kind === "percent"
        ? { percent_off: coupon.discount.percentOff }
        : { amount_off: coupon.discount.amountOffCents, currency: coupon.discount.currency }),
      name: coupon.promoCode,
    };

    const created = await stripe.coupons.create(couponParams);

    // Attach a promotion code that fans enter at checkout
    await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: created.id },
      code: coupon.promoCode,
      max_redemptions: coupon.maxRedemptions,
    });

    return NextResponse.json({ ok: true, code: coupon.promoCode, couponId: created.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
