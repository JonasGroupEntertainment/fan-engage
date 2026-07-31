"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";

/**
 * NOTE — Stripe Connect onboarding has been retired.
 *
 * This app now runs on a merchant-of-record model: ONE platform Stripe
 * account, ONE bank account attached to it. Every artist/community's
 * revenue is tagged with `community_id` / `community_slug` metadata on
 * the relevant Stripe object (Checkout Session, Subscription, Price,
 * Product) so the accountant can filter/group Stripe reports per
 * community and pay artists out manually via bank transfer — money never
 * moves automatically out of the platform's Stripe account.
 *
 * `createConnectOnboardingLinkAction` and `syncConnectStatusAction` used
 * to create Stripe Express connected accounts and drive artists through
 * Stripe's hosted onboarding (which is where the bank-info prompt came
 * from). Both are removed. The `stripe_connect_*` columns on
 * `communities` are left in place but unused.
 */

/**
 * Update the payout split percentage for a community. Still used for
 * reporting purposes — it drives the "artist share" figure shown on this
 * page and is informational for the accountant, not a live Stripe split.
 */
export async function updatePayoutSplitAction(formData: FormData): Promise<void> {
  const ctx = await getAdminContext();
  if (!ctx?.isSuperAdmin) throw new Error("Super-admin only");

  const communityId = String(formData.get("community_id") ?? "").trim();
  const pct = parseInt(String(formData.get("payout_split_pct") ?? "20"), 10);
  if (!communityId || isNaN(pct) || pct < 0 || pct > 100) {
    throw new Error("Invalid input");
  }

  const admin = createAdminClient();
  await admin
    .from("communities")
    .update({ payout_split_pct: pct })
    .eq("slug", communityId);

  revalidatePath("/admin/stripe/connect");
}

/**
 * Update subscription pricing for a community (in-DB only — does NOT
 * create new Stripe Prices; existing subscribers keep their current price
 * until they re-subscribe). Use /admin/stripe/seed to push new Stripe
 * Prices after changing the DB values here.
 */
export async function updatePricingAction(formData: FormData): Promise<void> {
  const ctx = await getAdminContext();
  if (!ctx?.isSuperAdmin) throw new Error("Super-admin only");

  const communityId = String(formData.get("community_id") ?? "").trim();
  const monthly = parseInt(String(formData.get("monthly_price_cents") ?? ""), 10);
  const annual = parseInt(String(formData.get("annual_price_cents") ?? ""), 10);

  if (!communityId || isNaN(monthly) || isNaN(annual)) throw new Error("Invalid input");
  if (monthly < 100 || annual < 100) throw new Error("Minimum price is $1.00");

  const admin = createAdminClient();
  await admin
    .from("communities")
    .update({ monthly_price_cents: monthly, annual_price_cents: annual })
    .eq("slug", communityId);

  revalidatePath("/admin/stripe/connect");
  revalidatePath("/admin/stripe/seed");
}
