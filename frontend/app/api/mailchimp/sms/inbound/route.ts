import { NextResponse } from "next/server";
import { resolveAppUrl } from "@/lib/app-url";
import { OFFICIAL_CONTACT_EMAIL } from "@/lib/legal/official-contact";
import { deliverSms, syncSmsOptInWithProvider } from "@/lib/sms/deliver";
import { supabaseSmsFanDirectory } from "@/lib/sms/fan-directory";
import { buildSmsForwardEvent, forwardInboundSms } from "@/lib/sms/forward";
import { handleInboundSms } from "@/lib/sms/inbound";
import { smsSendClass } from "@/lib/sms/kinds";
import {
  inboundTexts,
  keywordRepliesEnabled,
  mailchimpSmsPostAuthorized,
  parseMandrillEvents,
  readFormParams,
} from "@/lib/sms/mandrill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound SMS from the Mailchimp Transactional inbound route.
 *
 * This is the only inbound URL for +16152377488. Brand Engage Pro
 * uses the same number and does not register its own route. After
 * Fan Engage handles the message, the event is forwarded.
 * See docs/sms-mailchimp.md.
 *
 * Register with POST https://mandrillapp.com/api/1.4/inbound/add-route
 * (`phone` = the approved sending number, `url` = this route).
 * https://mailchimp.com/developer/transactional/api/inbound/add-route
 *
 * Mailchimp checks the URL with HEAD, then a POST whose mandrill_events
 * is [] signed with the key "test-webhook". Real events are signed with
 * this route's own key (MAILCHIMP_SMS_INBOUND_WEBHOOK_KEY), the key
 * Mailchimp assigns when the route is added. That is not the events
 * webhook's auth_key. When the inbound key is unset,
 * MAILCHIMP_SMS_WEBHOOK_KEY is used. Either value may be a
 * comma-separated list.
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

  const authorized = mailchimpSmsPostAuthorized(
    "inbound",
    {
      header: request.headers.get("x-mandrill-signature"),
      url: webhookUrl(),
      params,
    },
    process.env,
  );
  if (!authorized) return new NextResponse("Forbidden", { status: 403 });

  let events: unknown[];
  try {
    events = parseMandrillEvents(params.mandrill_events);
  } catch {
    console.warn("Mailchimp SMS inbound ignored a non-JSON payload");
    return new NextResponse("ok", { status: 200 });
  }

  const directory = supabaseSmsFanDirectory();
  const repliesOn = keywordRepliesEnabled(process.env);
  let failed = false;
  for (const message of inboundTexts(events)) {
    try {
      const outcome = await handleInboundSms({
        from: message.from,
        text: message.text,
        directory,
        supportEmail: OFFICIAL_CONTACT_EMAIL,
        sendKeywordReplies: repliesOn,
      });
      if (outcome.underAge) {
        console.warn("Mailchimp SMS START ignored for an under-18 fan", outcome.fanId);
      }
      if (outcome.providerOptIn !== null) {
        await syncSmsOptInWithProvider(message.from, outcome.providerOptIn);
      }
      if (outcome.reply) {
        const sent = await deliverSms({
          to: message.from,
          body: outcome.reply,
          ...smsSendClass("keyword_reply"),
        });
        if (!sent.ok) console.warn("Mailchimp SMS keyword reply failed", sent.error);
      }
    } catch (err) {
      failed = true;
      console.error("Mailchimp SMS inbound failed", err);
    }
    await forwardInboundSms(
      buildSmsForwardEvent({
        from: message.from,
        to: message.to,
        text: message.text,
        ts: message.ts,
        eventId: message.eventId,
      }),
    );
  }

  if (failed) return new NextResponse("error", { status: 500 });
  return new NextResponse("ok", { status: 200 });
}
