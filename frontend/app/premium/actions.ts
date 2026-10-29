"use server";

import { redirect } from "next/navigation";
import { APP_URL } from "@/lib/app-url";
import { captureAppException } from "@/lib/sentry";
import { isNextControlFlowError } from "@/lib/sentry-report";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  getOrCreateStripeCustomer,
  isFanTrialEligible,
  pickPriceId,
} from "@/lib/stripe-helpers";
import { TRIAL_DAYS } from "@/lib/premium-trial";
import { getCurrentCommunityId } from "@/lib/community";
import { isPremium } from "@/lib/entitlements";
import { adultGate } from "@/lib/age-gate";

const COMMUNITY_SLUG_RE = /^[a-z0-9-]{1,64}$/;

/**
 * `/premium?c=<slug>` picks the community to upgrade in (the paywall and
 * Premium CTAs link here with the artist's slug). Anything that isn't an
 * active community slug falls back to the hostname community, so a typo
 * or an unlaunched slug can never reach checkout.
 */
export async function resolvePremiumCommunityId(
  requested: string | string[] | null | undefined,
): Promise<string> {
  const fallback = await getCurrentCommunityId();
  const raw = Array.isArray(requested) ? requested[0] : requested;
  const slug = (raw ?? "").trim().toLowerCase();
  if (!slug || slug === fallback || !COMMUNITY_SLUG_RE.test(slug)) return fallback;
  try {
    const { data } = await createAdminClient()
      .from("communities")
      .select("slug, active")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    return data?.slug ? (data.slug as string) : fallback;
  } catch {
    return fallback;
  }
}

/** `/premium` for the hostname community, `/premium?c=<slug>` otherwise. */
async function premiumPathFor(communityId: string, query?: Record<string, string>): Promise<string> {
  const params = new URLSearchParams(query ?? {});
  const hostCommunity = await getCurrentCommunityId();
  if (communityId !== hostCommunity) params.set("c", communityId);
  const qs = params.toString();
  return qs ? `/premium?${qs}` : "/premium";
}

/**
 * Start a Stripe Checkout Session for Premium. Reads the community from
 * the form's `community` field (set from `/premium?c=`), falling back to
 * the request's hostname community, resolves the fan, gets-or-creates
 * their Stripe customer, picks the standard price ($10/mo or $99/yr),
 * creates the session, and redirects the browser to Stripe.
 *
 * Founding Fan is a free badge claimed when the fan joins or finishes
 * onboarding. Checkout does not select a founder price, and the webhook
 * does not grant or revoke a founder slot from a charge.
 */
export async function createCheckoutSessionAction(formData: FormData) {
  let fanId: string | null = null;
  let step = "billing-period";
  try {
    const billingPeriod = (formData.get("billing_period") ?? "monthly") as
      | "monthly"
      | "annual";
    if (billingPeriod !== "monthly" && billingPeriod !== "annual") {
      throw new Error("Invalid billing_period");
    }

    step = "community";
    const communityId = await resolvePremiumCommunityId(
      formData.get("community") as string | null,
    );
    const premiumPath = await premiumPathFor(communityId);

    // 1) Who's subscribing?
    step = "auth";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      const nextPath = encodeURIComponent(premiumPath);
      const ref = encodeURIComponent(communityId);
      redirect(`/signup?ref=${ref}&next=${nextPath}`);
    }
    fanId = user.id;

    const admin = createAdminClient();

    // Paid tiers are 18+. Fans who joined before the age check are asked
    // for a date of birth first (COPPA, 0070_age_check.sql).
    step = "age-gate";
    const { data: ageRow } = await admin
      .from("fans")
      .select("birth_date")
      .eq("id", user.id)
      .maybeSingle();
    const gate = adultGate((ageRow?.birth_date as string | null) ?? null);
    if (gate !== "ok") redirect(await premiumPathFor(communityId, { age: gate }));

    // 2) Which community?
    step = "load-community";
    const { data: community } = await admin
      .from("communities")
      .select(
        "slug, display_name, stripe_product_id, stripe_price_id_monthly, stripe_price_id_annual, active",
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
    step = "membership";
    const { data: existing } = await admin
      .from("fan_community_memberships")
      .select("subscription_tier")
      .eq("fan_id", user.id)
      .eq("community_id", communityId)
      .maybeSingle();
    if (isPremium(existing?.subscription_tier as string | null)) {
      redirect(await premiumPathFor(communityId, { already_active: "1" }));
    }

    // 4) Make sure the fan has a membership row — the webhook handler will
    //    update it when the subscription is created. If they don't have one
    //    yet (e.g. they signed up pre-migration-0011 and never got their
    //    raelynn membership), insert a free placeholder now.
    step = "ensure-membership";
    await admin
      .from("fan_community_memberships")
      .insert({
        fan_id: user.id,
        community_id: communityId,
        subscription_tier: "free",
      })
      .select()
      .maybeSingle();

    // 5) Standard price only. Founder price IDs stay in Stripe for
    //    subscriptions that already use them; new checkouts do not.
    step = "price";
    const priceId = pickPriceId(community, billingPeriod);
    if (!priceId) {
      throw new Error(
        `No Stripe price_id configured for ${billingPeriod} in ${communityId}`,
      );
    }

    // 6) Stripe Customer (get-or-create, cached on fans.stripe_customer_id)
    step = "customer";
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

    // 7) One free trial per account. Checked after the customer exists so
    //    the Stripe history lookup sees the right customer.
    step = "trial";
    const withTrial = await isFanTrialEligible(user.id);

    // 8) Create the Checkout Session
    step = "checkout-session";
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
        tier: "standard",
        billing_period: billingPeriod,
        trial: withTrial ? "1" : "0",
      },
      subscription_data: {
        ...(withTrial ? { trial_period_days: TRIAL_DAYS } : {}),
        metadata: {
          fan_id: user.id,
          community_id: communityId,
          community_slug: communityId,
          tier: "standard",
          billing_period: billingPeriod,
          trial: withTrial ? "1" : "0",
        },
      },
      success_url: `${APP_URL}/premium/welcome?session_id={CHECKOUT_SESSION_ID}&c=${encodeURIComponent(communityId)}`,
      cancel_url: `${APP_URL}${await premiumPathFor(communityId, { canceled: "1" })}`,
    });

    if (!session.url) {
      throw new Error("Stripe returned no Checkout URL");
    }

    redirect(session.url);
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    await captureAppException(error, {
      route: "/premium",
      step,
      fan_id: fanId,
    });
    throw error;
  }
}
