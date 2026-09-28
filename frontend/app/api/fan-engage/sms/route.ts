import { NextResponse, type NextRequest } from "next/server";
import twilio from "twilio";
import { fanDataRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { SMS_WELCOME_MESSAGE, smsRecipientForFan } from "@/lib/sms/welcome";

export const runtime = "nodejs";

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
    // Only ever text the signed-in fan's own stored number, and only after
    // they ticked the SMS consent box (recorded as fans.sms_opted_in by the
    // onboard route). The request body is ignored: no client-supplied
    // number or wording reaches Twilio.
    const { data: fan, error: fanErr } = await supabase
      .from("fans")
      .select("phone, sms_opted_in")
      .eq("id", user.id)
      .maybeSingle();
    if (fanErr) {
      console.error("sms: failed to load fan", fanErr);
      return NextResponse.json(
        { error: "Unable to send confirmation text." },
        { status: 500 },
      );
    }
    const recipient = smsRecipientForFan(fan);
    if (!recipient.ok) {
      return NextResponse.json({ error: recipient.error }, { status: recipient.status });
    }

    const client = twilio(accountSid, authToken);
    const config: Parameters<typeof client.messages.create>[0] = {
      to: recipient.phone,
      body: SMS_WELCOME_MESSAGE,
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
