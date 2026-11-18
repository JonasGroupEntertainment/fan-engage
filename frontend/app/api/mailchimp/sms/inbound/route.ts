import { NextResponse } from "next/server";
import { resolveAppUrl } from "@/lib/app-url";
import { OFFICIAL_CONTACT_EMAIL } from "@/lib/legal/official-contact";
import { deliverSms, smsProviderName, syncSmsOptInWithProvider } from "@/lib/sms/deliver";
import { supabaseSmsFanDirectory } from "@/lib/sms/fan-directory";
import { handleInboundSms } from "@/lib/sms/inbound";
import {
  inboundTexts,
  keywordRepliesEnabled,
  mandrillWebhookAuthorized,
  parseMandrillEvents,
  readFormParams,
} from "@/lib/sms/mandrill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound SMS from a Mailchimp Transactional inbound route.
 *
 * Register with POST https://mandrillapp.com/api/1.4/inbound/add-route
 * (`phone` = the approved sending number, `url` = this route).
 * https://mailchimp.com/developer/transactional/api/inbound/add-route
 *
 * Mailchimp checks the URL with HEAD, then a POST whose mandrill_events
 * is [] signed with the key "test-webhook". Real events are signed with
 * the webhook auth key (MAILCHIMP_SMS_WEBHOOK_KEY).
 */

function webhookUrl(): string {
  const override = process.env.MAILCHIMP_SMS_INBOUND_URL?.trim();
  if (override) return override;
  return `${resolveAppUrl()}/api/mailchimp/sms/inbound`;
}

export function GET() {
  return new NextResponse("ok", { status: 200 });
}

export function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    params = await readFormParams(request);
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  const authorized = mandrillWebhookAuthorized({
    header: request.headers.get("x-mandrill-signature"),
    url: webhookUrl(),
    params,
    webhookKey: process.env.MAILCHIMP_SMS_WEBHOOK_KEY,
  });
  if (!authorized) return new NextResponse("Forbidden", { status: 403 });

  let events: unknown[];
  try {
    events = parseMandrillEvents(params.mandrill_events);
  } catch {
    console.warn("Mailchimp SMS inbound ignored a non-JSON payload");
    return new NextResponse("ok", { status: 200 });
  }

  const directory = supabaseSmsFanDirectory();
  const provider = smsProviderName();
  try {
    for (const message of inboundTexts(events)) {
      const outcome = await handleInboundSms({
        from: message.from,
        text: message.text,
        provider: "mailchimp",
        directory,
        supportEmail: OFFICIAL_CONTACT_EMAIL,
        sendKeywordReplies: keywordRepliesEnabled(process.env),
      });
      if (outcome.action === "stop") {
        await syncSmsOptInWithProvider(message.from, false);
      } else if (outcome.action === "start" && outcome.optedIn === true) {
        await syncSmsOptInWithProvider(message.from, true);
      }
      if (outcome.reply && provider === "mailchimp") {
        const sent = await deliverSms({ to: message.from, body: outcome.reply });
        if (!sent.ok) console.warn("Mailchimp SMS keyword reply failed", sent.error);
      }
    }
  } catch (err) {
    console.error("Mailchimp SMS inbound failed", err);
    return new NextResponse("error", { status: 500 });
  }

  return new NextResponse("ok", { status: 200 });
}
