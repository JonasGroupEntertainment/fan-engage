import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { refreshOnboardingLink } from "@/lib/stripe-connect/onboarding";

/**
 * GET /api/stripe/connect/refresh?slug=<artistSlug>
 *
 * Stripe redirects users here when an onboarding session expires. We
 * re-issue a fresh onboarding link for the same Connect account and
 * immediately redirect the user back into Stripe so they pick up where
 * they left off.
 *
 * No new account is created here — the artist row already has a
 * stripe_account_id from the initial /start call. If for some reason the
 * row has no account id, the user is bounced back to the payouts page.
 */
export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim();

  if (!slug) {
        return NextResponse.json(
          { error: "Missing ?slug=<artistSlug> on the refresh URL." },
          { status: 400 },
              );
  }

  const admin = createAdminClient();
    const { data: artist, error } = await admin
      .from("artists")
      .select("stripe_account_id")
      .eq("slug", slug)
      .single();

  if (error || !artist?.stripe_account_id) {
        return NextResponse.redirect(
                new URL(`/admin/${slug}/payouts?onboarding=restart`, req.url),
              );
  }

  try {
        const link = await refreshOnboardingLink({
                accountId: artist.stripe_account_id,
        });
        return NextResponse.redirect(link.url);
  } catch (err) {
        console.error("[stripe-connect/refresh] failed", err);
        return NextResponse.redirect(
                new URL(`/admin/${slug}/payouts?onboarding=refresh_failed`, req.url),
              );
  }
}
