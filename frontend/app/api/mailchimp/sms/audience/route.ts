import { NextResponse } from "next/server";
import { handleMarketingAudienceSms } from "@/lib/sms/audience-forward";
import { syncSmsOptInWithProvider } from "@/lib/sms/deliver";
import { supabaseSmsFanDirectory } from "@/lib/sms/fan-directory";
import { optOutPhones } from "@/lib/sms/inbound";
import { readFormParams, safeEqual } from "@/lib/sms/mandrill";

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
 *
 * An SMS unsubscribe also forwards a signed STOP to Brand Engage on
 * the shared number. That forward is best-effort. A failure is logged
 * and does not change this route's response or Fan Engage's opt-out.
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

  const outcome = await handleMarketingAudienceSms({
    params,
    optOutLocally: async (phone) => {
      await optOutPhones([phone], supabaseSmsFanDirectory());
      await syncSmsOptInWithProvider(phone, false);
    },
  });
  if (outcome === "error") return new NextResponse("error", { status: 500 });
  return new NextResponse("ok", { status: 200 });
}
