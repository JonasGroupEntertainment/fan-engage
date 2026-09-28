"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  resolveSmsSwitch,
  smsOptInFromSettings,
  smsTierAllowed,
} from "@/lib/sms-send-gate";
import { TOGGLE_KEYS, type Prefs } from "./prefs";

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
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [{ data: fan }, { data: current }] = await Promise.all([
    supabase
      .from("fans")
      .select("current_tier, phone")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("notification_preferences")
      .select("sms_enabled")
      .eq("fan_id", user.id)
      .maybeSingle(),
  ]);

  const tierAllowsSms = smsTierAllowed(fan?.current_tier as string | null);
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

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { fan_id: user.id, ...payload, updated_at: new Date().toISOString() },
      { onConflict: "fan_id" },
    );
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
    const { error: optInError } = await supabase
      .from("fans")
      .update({ sms_opted_in: smsOptIn })
      .eq("id", user.id);
    if (optInError) {
      console.error("notifications: failed to sync sms_opted_in", optInError);
      return { error: "Could not save your SMS setting. Please try again." };
    }
  }

  revalidatePath("/me/notifications");
  return { ok: true };
}
