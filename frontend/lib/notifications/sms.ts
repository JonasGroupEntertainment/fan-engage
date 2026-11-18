import { createAdminClient } from "@/lib/supabase/admin";
import { deliverSms } from "@/lib/sms/deliver";
import { type SmsMessageType, smsSendClass } from "@/lib/sms/kinds";
import { smsAgeAllowsSend } from "@/lib/sms/policy";

/**
 * Send a single SMS to a fan. Tier-gated by default — only Gold/Platinum
 * fans receive SMS so the channel stays signal, not spam. Mailchimp
 * Transactional is the only sender.
 *
 * The caller is responsible for higher-level opt-in checks (preferences
 * table, quiet hours). This module only enforces:
 *   1. Mailchimp SMS is configured
 *   2. Fan has a phone + sms_opted_in
 *   3. Fan is 18+ when a birth date is on file (unknown dates stay
 *      grandfathered, matching the fans age trigger)
 *   4. Fan tier ≥ Gold (unless `bypassTierGate` is true)
 *   5. Promotional types stay blocked until the promotional flag is set
 *
 * Returns { sent, suppressionReason } so the caller can record the
 * audit log entry with the right reason. A missing provider or a
 * blocked promotional type is logged and does not throw.
 */

const TIER_RANK: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  founder: 3, // founders == platinum tier for gating
};

export interface SendSmsResult {
  sent: boolean;
  suppressionReason?:
    | "mailchimp_not_configured"
    | "promotional_disabled"
    | "no_phone"
    | "not_opted_in"
    | "under_18"
    | "tier_gate"
    | "send_failed";
  error?: string;
}

export async function sendSmsToFan(opts: {
  fanId: string;
  body: string;
  messageType: SmsMessageType;
  /** If true, skip the Gold-tier gate (e.g., RSVP confirmations to anyone with SMS opt-in). */
  bypassTierGate?: boolean;
}): Promise<SendSmsResult> {
  const admin = createAdminClient();
  const { data: fan } = await admin
    .from("fans")
    .select("id, phone, sms_opted_in, current_tier, birth_date")
    .eq("id", opts.fanId)
    .maybeSingle();

  if (!fan) return { sent: false, suppressionReason: "no_phone" };
  if (!fan.phone) return { sent: false, suppressionReason: "no_phone" };
  if (!fan.sms_opted_in) return { sent: false, suppressionReason: "not_opted_in" };
  if (!smsAgeAllowsSend(fan.birth_date as string | null)) {
    return { sent: false, suppressionReason: "under_18" };
  }

  if (!opts.bypassTierGate) {
    const rank = TIER_RANK[(fan.current_tier as string) ?? "bronze"] ?? 0;
    if (rank < TIER_RANK.gold) {
      return { sent: false, suppressionReason: "tier_gate" };
    }
  }

  const result = await deliverSms({
    to: fan.phone as string,
    body: opts.body,
    ...smsSendClass(opts.messageType),
  });
  if (result.ok) return { sent: true };
  if (result.blocked === "promotional_disabled") {
    return { sent: false, suppressionReason: "promotional_disabled", error: result.error };
  }
  if (!result.configured) {
    return { sent: false, suppressionReason: "mailchimp_not_configured", error: result.error };
  }
  if (result.optOut) {
    await admin.from("fans").update({ sms_opted_in: false }).eq("id", opts.fanId);
  }
  console.warn("sendSmsToFan failed for", opts.fanId, result.error);
  return {
    sent: false,
    suppressionReason: "send_failed",
    error: result.error,
  };
}
