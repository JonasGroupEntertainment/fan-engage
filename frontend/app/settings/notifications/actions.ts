"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setPreferences } from "@/lib/notifications/preferences";
import { smsOptInFromSettings } from "@/lib/sms-send-gate";
import type { NotificationPreferences } from "@/lib/notifications/types";

const TIER_RANK: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  founder: 3,
};

/**
 * Persist a fan's notification preferences. Server-side enforces the SMS
 * tier gate — even if the client sends sms_enabled=true for a Bronze
 * fan, we silently coerce it back to false.
 */
export async function saveNotificationPreferencesAction(
  patch: Partial<NotificationPreferences>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Enforce SMS tier gate
  let smsOptIn: boolean | null = null;
  if (patch.sms_enabled !== undefined) {
    const { data: fan } = await supabase
      .from("fans")
      .select("current_tier, phone")
      .eq("id", user.id)
      .maybeSingle();
    const rank = TIER_RANK[(fan?.current_tier as string) ?? "bronze"] ?? 0;
    const tierAllowsSms = rank >= TIER_RANK.gold;
    smsOptIn = smsOptInFromSettings(
      patch.sms_enabled,
      tierAllowsSms,
      fan?.phone as string | null | undefined,
    );
    if (patch.sms_enabled === true && !tierAllowsSms) {
      patch = { ...patch, sms_enabled: false };
    }
  }

  await setPreferences(user.id, patch);

  // The senders also check fans.sms_opted_in, so keep it in step with the
  // switch. Without this, a fan who turns SMS on here still gets no texts.
  if (smsOptIn !== null) {
    const { error } = await supabase
      .from("fans")
      .update({ sms_opted_in: smsOptIn })
      .eq("id", user.id);
    if (error) {
      console.error("settings: failed to sync sms_opted_in", error);
      throw new Error("Could not save your SMS setting. Please try again.");
    }
  }

  revalidatePath("/settings/notifications");
}
