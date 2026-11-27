"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailReaskUpdates, needsEmailReask } from "@/lib/marketing-consent";

export type EmailReaskResult = { ok: true; agreed: boolean } | { ok: false; error: string };

const SAVE_FAILED = "We could not save your choice. Please try again.";

/**
 * The fan's answer to "Want email from us?". Only for fans the old join
 * form opted in without a tick (email_opted_in true, no email_consent_at).
 * Yes stamps the consent record; No turns email off.
 *
 * The write uses the service role, scoped to the signed-in fan, so the
 * consent time is always the server's.
 */
export async function answerEmailReaskAction(agree: boolean): Promise<EmailReaskResult> {
  if (typeof agree !== "boolean") return { ok: false, error: SAVE_FAILED };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };

  const admin = createAdminClient();
  const { data: fan, error: readError } = await admin
    .from("fans")
    .select("email_opted_in, email_consent_at")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("answerEmailReaskAction: read failed", { fanId: user.id, code: readError.code });
    return { ok: false, error: SAVE_FAILED };
  }
  // Already answered (or never auto opted in): nothing to change.
  if (!needsEmailReask(fan)) return { ok: true, agreed: Boolean(fan?.email_consent_at) };

  const { error } = await admin.from("fans").update(emailReaskUpdates(agree)).eq("id", user.id);
  if (error) {
    console.error("answerEmailReaskAction: update failed", { fanId: user.id, code: error.code });
    return { ok: false, error: SAVE_FAILED };
  }
  revalidatePath("/");
  revalidatePath("/me/notifications");
  return { ok: true, agreed: agree };
}
