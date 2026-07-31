"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  getOrCreateStripeCustomer,
  getFounderState,
  pickPriceId,
} from "@/lib/stripe-helpers";
import { getCurrentCommunityId } from "@/lib/community";

/**
 * Start a Stripe Checkout Session for Premium. Reads the current
 * community from request context, resolves the fan, gets-or-creates
 * their Stripe customer, picks the right price_id (founder vs
 * standard × monthly vs annual), creates the session, and redirects
 * the browser to Stripe.
 *
 * Founder slot assignment is atomic at webhook time — we only PICK
 * the founder price here if slots are still available, but a race at
 * the boundary means two users might both get a founder price_id; the
 * webhook handler (Phase 5c) re-checks the count before assigning
 * is_founder=true + founder_number.
 */
export async function createCheckoutSessionAction(formData: FormData) {
  const billingPeriod = (formData.get("billing_period") ?? "monthly") as
    | "monthly"
    | "annual";
  if (billingPeriod !== "monthly" && billingPeriod !== "annual") {
    throw new Error("Invalid billing_period");
  }

  // 1) Who's subscribing?
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    redirect(`/login?next=${encodeURIComponent("/premium")}`);
  }

  // 2) Which community?
  const communityId = await getCurrentCommunityId();
  const admin = createAdminClient();
  const { data: community } = await admin
    .from("communities")
    .select(
      "slug, display_name, stripe_product_id, stripe_price_id_monthly, stripe_price_id_annual, stripe_price_id_founder_monthly, stripe_price_id_founder_annual, active",
    )
    .eq("slug", communityId)
    .maybeSingle();

  if (!community) {
    throw new Error(`Community ${communityId} not found`);
  }
  if (!community.active) {
    throw new Error(`Community ${communityId} is not active`);
  }
  if (!community.stripe_product_id) {
    throw new Error(
      `Community ${communityId} hasn't been seeded in Stripe yet — run /admin/stripe/seed first`,
    );
  }

  // 3) Already subscribed? Don't let them create a second subscription.
  const { data: existing } = await admin
    .from("fan_community_memberships")
    .select("subscription_tier")
    .eq("fan_id", user.id)
    .eq("community_id", communityId)
    .maybeSingle();
  if (
    existing?.subscription_tier === "premium" ||
    existing?.subscription_tier === "past_due" ||
    existing?.subscription_tier === "comped"
  ) {
    redirect(`/premium?already_active=1`);
  }

  // 4) Make sure the fan has a membership row — the webhook handler will
  //    update it when the subscription is created. If they don't have one
  //    yet (e.g. they signed up pre-migration-0011 and never got their
  //    raelynn membership), insert a free placeholder now.
  await admin
    .from("fan_community_memberships")
    .insert({
      fan_id: user.id,
      community_id: communityId,
      subscription_tier: "free",
    })
    .select()
    .maybeSingle();

  // 5) Founder eligibility (advisory — webhook re-checks atomically)
  const founderState = await getFounderState(communityId);
  const asFounder = !founderState.isFull;

  const priceId = pickPriceId(community, billingPeriod, asFounder);
  if (!priceId) {
    throw new Error(
      `No Stripe price_id configured for ${billingPeriod}/${asFounder ? "founder" : "standard"} in ${communityId}`,
    );
  }

  // 6) Stripe Customer (get-or-create, cached on fans.stripe_customer_id)
  const { data: fanRow } = await admin
    .from("fans")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();
  const customerId = await getOrCreateStripeCustomer({
    fanId: user.id,
    email: user.email,
    firstName: (fanRow?.first_name as string | null) ?? null,
  });

  // 7) Create the Checkout Session
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "fanengagepro.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: `${user.id}:${communityId}`,
    metadata: {
      fan_id: user.id,
      community_id: communityId,
      community_slug: communityId,
      tier: asFounder ? "founder" : "standard",
      billing_period: billingPeriod,
    },
    subscription_data: {
      metadata: {
        fan_id: user.id,
        community_id: communityId,
        community_slug: communityId,
        tier: asFounder ? "founder" : "standard",
        billing_period: billingPeriod,
      },
    },
    success_url: `${origin}/premium/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/premium?canceled=1`,
  });

  if (!session.url) {
    throw new Error("Stripe returned no Checkout URL");
  }

  redirect(session.url);
}
