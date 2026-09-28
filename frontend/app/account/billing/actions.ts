"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { PREMIUM_CTA } from "@/lib/entitlements";

/**
 * Opens the Stripe billing portal for any fan who has a Stripe customer,
 * not only active Premium members. Lapsed, canceled or past-due fans still
 * need to see invoices and update a card. Fans with no customer yet go to
 * the Premium page instead.
 */
export async function openBillingPortalAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/billing");

  const admin = createAdminClient();
  const { data: fan } = await admin
    .from("fans")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = fan?.stripe_customer_id as string | null;
  if (!customerId) {
    redirect(PREMIUM_CTA.href);
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "fanengagepro.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/account/billing`,
  });

  redirect(session.url);
}
