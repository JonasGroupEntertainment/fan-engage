import { NextResponse } from "next/server";
import { supabaseSmsFanDirectory } from "@/lib/sms/fan-directory";
import { optOutPhones } from "@/lib/sms/inbound";
import { marketingSmsOptOutPhone, readFormParams, safeEqual } from "@/lib/sms/mandrill";
import { syncSmsOptInWithProvider } from "@/lib/sms/deliver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marketing audience webhook for SMS unsubscribes. Mailchimp does not
 * sign these the way Transactional does. The registered URL must include
 * ?key= equal to MAILCHIMP_AUDIENCE_WEBHOOK_SECRET.
 *
 * Audience → Settings → Webhooks → enable "SMS unsubscribes".
 * https://mailchimp.com/help/about-webhooks/
 * https://mailchimp.com/developer/marketing/guides/sync-audience-data-webhooks/
 *
 * An email unsubscribe is ignored. Email consent is not SMS consent.
 */

export function GET() {
  return new NextResponse("ok", { status: 200 });
}

export function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  const secret = process.env.MAILCHIMP_AUDIENCE_WEBHOOK_SECRET?.trim() ?? "";
  const provided = new URL(request.url).searchParams.get("key") ?? "";
  if (!secret || !safeEqual(provided, secret)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let params: Record<string, string>;
  try {
    params = await readFormParams(request);
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  const phone = marketingSmsOptOutPhone(params);
  if (!phone) return new NextResponse("ok", { status: 200 });

  try {
    await optOutPhones([phone], supabaseSmsFanDirectory());
    await syncSmsOptInWithProvider(phone, false);
  } catch (err) {
    console.error("Mailchimp audience SMS opt-out failed", err);
    return new NextResponse("error", { status: 500 });
  }

  return new NextResponse("ok", { status: 200 });
}
