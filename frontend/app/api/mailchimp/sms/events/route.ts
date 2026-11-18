import { NextResponse } from "next/server";
import { resolveAppUrl } from "@/lib/app-url";
import { supabaseSmsFanDirectory } from "@/lib/sms/fan-directory";
import { optOutPhones } from "@/lib/sms/inbound";
import {
  mandrillWebhookAuthorized,
  parseMandrillEvents,
  readFormParams,
  transactionalOptOutPhones,
} from "@/lib/sms/mandrill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transactional SMS event webhook: unsubscribes, denylist adds, and
 * sends rejected because the number is already unsubscribed.
 *
 * In the Transactional app: Webhooks → Add, events under the SMS
 * section, at least "Message recipient unsubscribes". The API equivalent
 * is POST /webhooks/add with "unsub" (and the denylist sync events the
 * account exposes). The response `auth_key` is MAILCHIMP_SMS_WEBHOOK_KEY.
 * https://mailchimp.com/developer/transactional/docs/transactional-sms/
 * https://mailchimp.com/developer/transactional/api/webhooks/add
 */

function webhookUrl(): string {
  const override = process.env.MAILCHIMP_SMS_EVENTS_URL?.trim();
  if (override) return override;
  return `${resolveAppUrl()}/api/mailchimp/sms/events`;
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
    console.warn("Mailchimp SMS events ignored a non-JSON payload");
    return new NextResponse("ok", { status: 200 });
  }

  try {
    await optOutPhones(transactionalOptOutPhones(events), supabaseSmsFanDirectory());
  } catch (err) {
    console.error("Mailchimp SMS event opt-out failed", err);
    return new NextResponse("error", { status: 500 });
  }

  return new NextResponse("ok", { status: 200 });
}
