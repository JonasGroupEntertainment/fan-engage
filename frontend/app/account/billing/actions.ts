"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { PREMIUM_CTA, requirePremiumAnywhere } from "@/lib/entitlements";

export async function openBillingPortalAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/billing");

  const gate = await requirePremiumAnywhere(user.id);
  if (!gate.allowed) {
    redirect(PREMIUM_CTA.href);
  }

  const admin = createAdminClient();
  const { data: fan } = await admin
    .from("fans")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = fan?.stripe_customer_id as string | null;
  if (!customerId) {
    throw new Error(
      "No billing account found. Subscribe to a community first.",
    );
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
