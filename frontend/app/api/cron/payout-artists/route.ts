import { verifyCronAuth } from "@/lib/cron-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/payout-artists
 *
 * RETIRED. This app runs on a merchant-of-record model: one platform
 * Stripe account, one bank account. Money never moves automatically out
 * of the platform's Stripe account to an artist's own bank account —
 * Stripe Connect Transfers are no longer created here.
 *
 * Artist revenue is tagged with `community_id` / `community_slug`
 * metadata on Checkout Sessions, Subscriptions, Products, and Prices
 * (see /admin/stripe/connect and /admin/stripe/seed). The accountant
 * filters the Stripe dashboard/reports by that tag and pays artists
 * manually via bank transfer, outside of Stripe.
 *
 * This route is left in place (rather than deleted) only so any stale
 * external cron trigger hitting it gets a clean, auth-gated no-op
 * instead of a 404. It is NOT registered in vercel.json's cron list.
 */
export async function GET(request: Request) {
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  return NextResponse.json({
    ok: true,
    retired: true,
    message:
      "Automatic artist payouts via Stripe Connect Transfers have been removed. " +
      "Payouts are now handled manually by the accountant from Stripe reports filtered by community_id.",
  });
}
