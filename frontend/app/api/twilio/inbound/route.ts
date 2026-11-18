import { NextResponse } from "next/server";
import twilio from "twilio";
import { OFFICIAL_CONTACT_EMAIL } from "@/lib/legal/official-contact";
import { supabaseSmsFanDirectory } from "@/lib/sms/fan-directory";
import { handleInboundSms } from "@/lib/sms/inbound";
import { syncSmsOptInWithProvider } from "@/lib/sms/deliver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio inbound SMS webhook — carrier compliance for STOP / HELP keywords.
 *
 * Configure in Twilio Console:
 *   Messaging Service → Integration → Incoming Messages
 *   URL: https://<your-domain>/api/twilio/inbound (POST, x-www-form-urlencoded)
 *
 * We respond with TwiML so Twilio sends the correct reply back to the fan.
 * STOP / STOPALL / UNSUB / UNSUBSCRIBE / CANCEL / END / QUIT → opt out
 * HELP / INFO                                               → help text
 * START / YES / UNSTOP                                      → opt back in
 * Anything else                                             → silent ack (empty TwiML)
 *
 * Mailchimp's extra compliance words (OPTOUT, REVOKE, and the non-English
 * stop words) take the same opt-out path. A known under-18 fan who texts
 * START is not opted back in.
 */

function twimlResponse(message: string | null): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    // Verify Twilio signature before processing — prevents spoofed STOP/START
    // from arbitrary callers who know our phone number.
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (twilioAuthToken) {
      const sig = request.headers.get("x-twilio-signature") ?? "";
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "https://fanengagepro.com";
      const webhookUrl = `${appUrl}/api/twilio/inbound`;
      const params: Record<string, string> = {};
      for (const [k, v] of form.entries()) params[k] = String(v);
      if (!twilio.validateRequest(twilioAuthToken, sig, webhookUrl, params)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    const from = String(form.get("From") ?? "");
    const bodyRaw = String(form.get("Body") ?? "");
    if (!from) return twimlResponse(null);

    const outcome = await handleInboundSms({
      from,
      text: bodyRaw,
      provider: "twilio",
      directory: supabaseSmsFanDirectory(),
      supportEmail: OFFICIAL_CONTACT_EMAIL,
    });

    if (outcome.action === "stop") {
      await syncSmsOptInWithProvider(from, false);
    } else if (outcome.action === "start" && outcome.optedIn === true) {
      await syncSmsOptInWithProvider(from, true);
    }

    return twimlResponse(outcome.reply);
  } catch {
    // Never 500 on this endpoint — Twilio will retry and duplicate messages.
    return twimlResponse(null);
  }
}
