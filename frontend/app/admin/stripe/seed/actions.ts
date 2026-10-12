"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import type { Community } from "@/lib/community";

/**
 * Seed Stripe Product + 4 Prices for a community. Idempotent: if the
 * community already has a stripe_product_id, this is a no-op. Super-admin
 * only.
 *
 * Creates per community:
 *   - 1 Product (name = display_name, metadata includes the slug)
 *   - 4 Prices: standard × monthly/annual + founder × monthly/annual
 *
 * Founder price IDs are created so subscriptions already on them stay
 * put. New checkouts use the standard monthly and annual prices only
 * and do not select the founder price IDs.
 */
export async function seedStripeProductsAction(formData: FormData): Promise<void> {
  const ctx = await getAdminContext();
  if (!ctx?.isSuperAdmin) {
    throw new Error("Super-admin only");
  }

  const communityId = String(formData.get("community_id") ?? "").trim();
  if (!communityId) {
    throw new Error("Missing community_id");
  }

  const db = createAdminClient();
  const { data: row, error: loadErr } = await db
    .from("communities")
    .select("*")
    .eq("slug", communityId)
    .maybeSingle();
  if (loadErr || !row) {
    throw new Error(loadErr?.message ?? "Community not found");
  }
  const community = row as Community & {
    monthly_price_cents: number;
    annual_price_cents: number;
    stripe_product_id: string | null;
    stripe_price_id_monthly: string | null;
  };

  // Idempotent — if already seeded, no-op but still revalidate so the UI
  // re-fetches fresh state.
  if (community.stripe_product_id && community.stripe_price_id_monthly) {
    revalidatePath("/admin/stripe/seed");
    return;
  }

  const stripe = getStripe();

  try {
    // 1) Product
    const product = await stripe.products.create({
      name: `${community.display_name} — Premium Fan Experience`,
      description:
        community.tagline ??
        `Premium membership for ${community.display_name}. Includes exclusive drops, early event access, and backstage perks.`,
      metadata: {
        community_slug: community.slug,
        community_type: community.type,
      },
    });

    // 2) Four Prices — all in USD, recurring
    const mkPrice = (
      amount: number,
      interval: "month" | "year",
      tier: "standard" | "founder",
    ) =>
      stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: amount,
        recurring: { interval },
        lookup_key: `${community.slug}_${tier}_${interval === "month" ? "monthly" : "annual"}`,
        metadata: {
          community_slug: community.slug,
          tier,
          billing_period: interval === "month" ? "monthly" : "annual",
        },
      });

    const [monthly, annual, founderMonthly, founderAnnual] = await Promise.all([
      mkPrice(community.monthly_price_cents, "month", "standard"),
      mkPrice(community.annual_price_cents, "year", "standard"),
      mkPrice(community.monthly_price_cents, "month", "founder"),
      mkPrice(community.annual_price_cents, "year", "founder"),
    ]);

    // 3) Write IDs back to the community row
    const { error: updErr } = await db
      .from("communities")
      .update({
        stripe_product_id: product.id,
        stripe_price_id_monthly: monthly.id,
        stripe_price_id_annual: annual.id,
        stripe_price_id_founder_monthly: founderMonthly.id,
        stripe_price_id_founder_annual: founderAnnual.id,
      })
      .eq("slug", community.slug);
    if (updErr) {
      throw new Error(updErr.message);
    }

    revalidatePath("/admin/stripe/seed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("seedStripeProductsAction: Stripe error", message);
    throw new Error(message);
  }
}
