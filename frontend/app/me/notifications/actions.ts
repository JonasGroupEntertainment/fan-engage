"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  resolveSmsSwitch,
  smsOptInFromSettings,
  smsTierAllowed,
} from "@/lib/sms-send-gate";
import { SMS_GUARDIAN_MESSAGE, smsTextOptIn } from "@/lib/age-gate";
import { isMissingSmsParentConsentColumn } from "@/lib/sms/policy";
import { syncSmsOptInWithProvider } from "@/lib/sms/deliver";
import { TOGGLE_KEYS, isMissingPendingColumn, type Prefs } from "./prefs";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function cleanTime(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return TIME_RE.test(value) ? value.slice(0, 5) : null;
}

/**
 * Persist a fan's notification preferences. The server enforces the SMS
 * tier gate (Gold and up can turn SMS on) and keeps fans.sms_opted_in in
 * step with the switch, since the senders check both.
 */
export async function savePreferencesAction(
  prefs: Prefs,
  smsParentConsent = false,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [fanRes, { data: current }] = await Promise.all([
    supabase
      .from("fans")
      .select("current_tier, phone, birth_date, sms_parent_consent_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("notification_preferences")
      .select("sms_enabled")
      .eq("fan_id", user.id)
      .maybeSingle(),
  ]);
  let fan = fanRes.data;
  if (fanRes.error && isMissingSmsParentConsentColumn(fanRes.error)) {
    const plain = await supabase
      .from("fans")
      .select("current_tier, phone, birth_date")
      .eq("id", user.id)
      .maybeSingle();
    fan = plain.data as typeof fan;
  } else if (fanRes.error) {
    return { error: "Could not save your preferences. Please try again." };
  }

  // A new SMS turn-on needs Gold tier. Ages 13 to 17 also need the
  // separate parent tick. No birth date is not blocked. Under 13 is refused.
  const tierAllowsSms = smsTierAllowed(fan?.current_tier as string | null);
  const alreadyTextConsent = Boolean(
    (fan as { sms_parent_consent_at?: string | null } | null)?.sms_parent_consent_at,
  );
  const turningSmsOn = !!prefs.sms_enabled && !current?.sms_enabled;
  const smsAge = smsTextOptIn({
    birthDate: (fan?.birth_date as string | null) ?? null,
    requested: turningSmsOn,
    smsParentConsent: smsParentConsent || alreadyTextConsent,
  });
  if (smsAge.rejected) return { error: SMS_GUARDIAN_MESSAGE };
  const sms = resolveSmsSwitch(
    !!prefs.sms_enabled,
    !!current?.sms_enabled,
    tierAllowsSms,
  );

  // Sanitize: only known keys, cast to bool.
  const payload: Record<string, boolean | string | null> = {};
  for (const k of TOGGLE_KEYS) {
    payload[k] = !!prefs[k];
  }
  payload.sms_enabled = sms.smsEnabled;
  payload.quiet_start = cleanTime(prefs.quiet_start);
  payload.quiet_end = cleanTime(prefs.quiet_end);

  let { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { fan_id: user.id, ...payload, updated_at: new Date().toISOString() },
      { onConflict: "fan_id" },
    );
  // notify_streak is migration 0089; until it is applied the upsert fails
  // with 42703 (undefined column). Strip it and save the rest rather than
  // failing every save on the page.
  const missing = isMissingPendingColumn(error);
  if (missing) {
    const { [missing]: _skipped, ...rest } = payload;
    void _skipped;
    ({ error } = await supabase
      .from("notification_preferences")
      .upsert(
        { fan_id: user.id, ...rest, updated_at: new Date().toISOString() },
        { onConflict: "fan_id" },
      ));
  }
  if (error) {
    console.error("notifications: failed to save preferences", error);
    return { error: "Could not save your preferences. Please try again." };
  }

  // The senders also check fans.sms_opted_in, so keep it in step with the
  // switch. Without this, a fan who turns SMS on here still gets no texts.
  const smsOptIn = sms.changed
    ? smsOptInFromSettings(
        sms.smsEnabled,
        tierAllowsSms,
        fan?.phone as string | null | undefined,
      )
    : null;
  if (smsOptIn !== null) {
    const fanUpdate: { sms_opted_in: boolean; sms_parent_consent_at?: string } = {
      sms_opted_in: smsOptIn,
    };
    if (smsOptIn && smsAge.stampConsent) {
      fanUpdate.sms_parent_consent_at = new Date().toISOString();
    }
    let { error: optInError } = await supabase.from("fans").update(fanUpdate).eq("id", user.id);
    if (optInError && isMissingSmsParentConsentColumn(optInError)) {
      if (smsAge.stampConsent) return { error: SMS_GUARDIAN_MESSAGE };
      ({ error: optInError } = await supabase
        .from("fans")
        .update({ sms_opted_in: smsOptIn })
        .eq("id", user.id));
    }
    if (optInError) {
      console.error("notifications: failed to sync sms_opted_in", optInError);
      return { error: "Could not save your SMS setting. Please try again." };
    }
    await syncSmsOptInWithProvider(fan?.phone as string | null, smsOptIn);
  }

  revalidatePath("/me/notifications");
  return { ok: true };
}
