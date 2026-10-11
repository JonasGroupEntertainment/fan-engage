"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AGE_BLOCKED_MESSAGE,
  birthDateReturnPath,
  isAdult,
  isUnder13,
  parseBirthDate,
  toIsoDate,
} from "@/lib/age-gate";

export type BirthDateResult = { ok: false; error: string; blocked?: boolean } | null;

/**
 * Saves a signed-in fan's date of birth once. Used by fans who joined
 * before the age check. An under-13 date is never stored. The database
 * also refuses a change once a date is set (0070_age_check.sql).
 */
export async function saveBirthDateAction(
  _prev: BirthDateResult,
  formData: FormData,
): Promise<BirthDateResult> {
  const next = birthDateReturnPath(formData.get("next"));
  const dob = parseBirthDate(
    String(formData.get("year") ?? ""),
    String(formData.get("month") ?? ""),
    String(formData.get("day") ?? ""),
  );
  if (!dob) return { ok: false, error: "Enter a valid date of birth." };
  if (isUnder13(dob)) return { ok: false, error: AGE_BLOCKED_MESSAGE, blocked: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const admin = createAdminClient();
  const { error } = await admin
    .from("fans")
    .update({ birth_date: toIsoDate(dob) })
    .eq("id", user.id)
    .is("birth_date", null);
  if (error) {
    console.error("[birth-date] save failed", { fanId: user.id, code: error.code });
    return { ok: false, error: "We couldn't save that. Please try again." };
  }

  // Under 18: the database turns fans.sms_opted_in off. Turn the settings
  // switch off too so the page and the senders agree.
  if (!isAdult(dob)) {
    const { error: prefsError } = await admin
      .from("notification_preferences")
      .update({ sms_enabled: false, updated_at: new Date().toISOString() })
      .eq("fan_id", user.id);
    if (prefsError) {
      console.error("[birth-date] sms switch-off failed", { fanId: user.id, code: prefsError.code });
    }
  }

  // A date that was already set is left alone; the page re-reads it.
  redirect(next);
}
