"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailMarketingUpdates } from "@/lib/marketing-consent";

export type EmailMarketingResult = { ok: true; on: boolean } | { ok: false; error: string };

const SAVE_FAILED = "We could not save your email setting. Please try again.";

/**
 * The marketing email switch in notification settings. On records a fresh
 * consent (time and wording version); off turns email off.
 *
 * The write uses the service role, scoped to the signed-in fan, so the
 * consent time is always the server's. If the consent columns do not exist
 * yet (migration 0109), turning on fails with the message below: without a
 * record there is no consent to act on.
 */
export async function setMarketingEmailAction(on: boolean): Promise<EmailMarketingResult> {
  if (typeof on !== "boolean") return { ok: false, error: SAVE_FAILED };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (on && !user.email) return { ok: false, error: SAVE_FAILED };

  const { error } = await createAdminClient()
    .from("fans")
    .update(emailMarketingUpdates(on))
    .eq("id", user.id);
  if (error) {
    console.error("setMarketingEmailAction: update failed", { fanId: user.id, code: error.code });
    return { ok: false, error: SAVE_FAILED };
  }
  revalidatePath("/me/notifications");
  revalidatePath("/");
  return { ok: true, on };
}
