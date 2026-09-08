import { NextRequest, NextResponse } from "next/server";

import { syncAccountStatus } from "@/lib/stripe-connect/onboarding";

/**
 * GET /api/stripe/connect/return?slug=<artistSlug>
 *
 * Stripe redirects users here after they finish (or bail out of) the
 * hosted onboarding flow. We pull the latest account state from Stripe
 * synchronously, sync it into the artists row, then redirect to the
 * artist's payouts admin page.
 *
 * Note: redirecting here does NOT mean onboarding succeeded. The account
 * may still be details_submitted=false (user bailed) or payouts_enabled=
 * false (Stripe still verifying). The /admin/<slug>/payouts page reads
 * the mirror flags and renders the appropriate state.
 *
 * The account.updated webhook also fires async and re-syncs the same
 * flags. This sync is just for immediate UX.
 */
export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim();

  if (!slug) {
        return NextResponse.json(
          { error: "Missing ?slug=<artistSlug> on the return URL." },
          { status: 400 },
              );
  }

  try {
        const flags = await syncAccountStatus({ artistSlug: slug });
        const status = flags.payoutsEnabled
          ? "active"
                : flags.detailsSubmitted
            ? "verifying"
                  : "incomplete";
        return NextResponse.redirect(
                new URL(`/admin/${slug}/payouts?onboarding=${status}`, req.url),
              );
  } catch (err) {
        console.error("[stripe-connect/return] sync failed", err);
        return NextResponse.redirect(
                new URL(`/admin/${slug}/payouts?onboarding=sync_failed`, req.url),
              );
  }
}
