import { NextResponse, type NextRequest } from "next/server";
import { SMS_GUARDIAN_MESSAGE } from "@/lib/age-gate";
import { fanDataRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deliverSms } from "@/lib/sms/deliver";
import { smsSendClass } from "@/lib/sms/kinds";
import { isMissingSmsParentConsentColumn, smsAgeAllowsSend } from "@/lib/sms/policy";
import { SMS_WELCOME_MESSAGE, smsRecipientForFan } from "@/lib/sms/welcome";

export const runtime = "nodejs";

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
  try {
    // Only ever text the signed-in fan's own stored number, and only after
    // they ticked the SMS consent box (recorded as fans.sms_opted_in by the
    // onboard route). The request body is ignored: no client-supplied
    // number or wording is sent.
    let { data: fan, error: fanErr } = await supabase
      .from("fans")
      .select("phone, sms_opted_in, birth_date, sms_parent_consent_at")
      .eq("id", user.id)
      .maybeSingle();
    if (fanErr && isMissingSmsParentConsentColumn(fanErr)) {
      const plain = await supabase
        .from("fans")
        .select("phone, sms_opted_in, birth_date")
        .eq("id", user.id)
        .maybeSingle();
      fan = plain.data;
      fanErr = plain.error;
    }
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
    const consentAt = (fan as { sms_parent_consent_at?: string | null } | null)
      ?.sms_parent_consent_at;
    if (!smsAgeAllowsSend(fan?.birth_date as string | null, new Date(), consentAt)) {
      return NextResponse.json({ error: SMS_GUARDIAN_MESSAGE }, { status: 403 });
    }

    const sent = await deliverSms({
      to: recipient.phone,
      body: SMS_WELCOME_MESSAGE,
      ...smsSendClass("welcome"),
    });
    if (!sent.ok) {
      if (sent.optOut) {
        const admin = createAdminClient();
        await admin.from("fans").update({ sms_opted_in: false }).eq("id", user.id);
      }
      console.error("Failed to send opt-in SMS", sent.error);
      return NextResponse.json(
        { error: "Unable to send confirmation text." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send Mailchimp opt-in:", error);
    return NextResponse.json(
      { error: "Unable to send confirmation text." },
      { status: 500 }
    );
  }
}
