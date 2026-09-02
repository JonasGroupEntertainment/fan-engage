import { NextResponse, type NextRequest } from "next/server";
import twilio from "twilio";
import { fanDataRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { normalizeSmsPhone } from "@/lib/sms-send-gate";

export const runtime = "nodejs";

type SmsPayload = {
  phone: string;
  firstName?: string;
  interest?: string;
};

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const defaultFrom = process.env.TWILIO_DEFAULT_FROM;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIp = getClientIp(request.headers);
  const rateLimitResult = fanDataRateLimiter.check(clientIp);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: "Too many SMS requests. Please try again later.",
        retryAfter: Math.ceil(
          (rateLimitResult.resetTime.getTime() - Date.now()) / 1000,
        ),
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(
            (rateLimitResult.resetTime.getTime() - Date.now()) / 1000,
          ).toString(),
          "X-RateLimit-Limit": rateLimitResult.limit.toString(),
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": rateLimitResult.resetTime.toISOString(),
        },
      },
    );
  }
  if (!accountSid || !authToken || (!messagingServiceSid && !defaultFrom)) {
    return NextResponse.json(
      { error: "Twilio credentials are not configured" },
      { status: 500 }
    );
  }

  try {
    const { phone: rawPhone, firstName, interest } = (await request.json()) as SmsPayload;
    const phone = normalizeSmsPhone(rawPhone);

    if (!phone) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }
    // Require E.164 format to prevent passing arbitrary strings to Twilio
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    const client = twilio(accountSid, authToken);
    // Welcome text — points at the first point-earning action so the fan has
    // a reason to open the app right away. Includes carrier-required opt-out.
    const body =
      `Hey ${firstName ?? "fan"}! 🎶 Welcome to Fan Engage` +
      (interest ? ` — we'll keep an ear out for ${interest}.` : ".") +
      ` Earn your first 100 pts: follow an artist, RSVP to an event, or share the app. ` +
      `Reply HELP for help. STOP to opt out. Msg&data rates may apply.`;

    const config: Parameters<typeof client.messages.create>[0] = {
      to: phone,
      body,
    };

    if (messagingServiceSid) {
      config.messagingServiceSid = messagingServiceSid;
    } else if (defaultFrom) {
      config.from = defaultFrom;
    }

    await client.messages.create(config);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send Twilio opt-in:", error);
    return NextResponse.json(
      { error: "Unable to send confirmation text." },
      { status: 500 }
    );
  }
}
