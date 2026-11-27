"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Update the signed-in fan's privacy preferences.
 *
 * Currently exposes one toggle: public_profile_enabled. This controls whether
 * /fans/<profile_slug> is reachable. When false, the route 404s — fans can
 * opt out of being publicly listed without leaking that the slug exists.
 *
 * The actual public profile data layer (lib/data/fan-profile.ts) NEVER
 * exposes email, phone, last login, stripe ids, or moderation state — that's
 * a hard architectural guarantee, not a per-user setting. So this single
 * toggle is the full privacy surface for now. Per-field toggles can be added
 * later by extending this action and the schema.
 */
export type PrivacySaveResult = { ok: true } | { ok: false; error: string };

const PRIVACY_SAVE_FAILED =
  "We couldn't save that change. Your setting is the same as before. Please try again.";

/**
 * Returns whether the change saved, so the toggle never says "Saved" when
 * it did not. A fan must be able to trust that "off" means private.
 */
export async function savePrivacyAction(formData: FormData): Promise<PrivacySaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };

  const publicProfileEnabled =
    String(formData.get("public_profile_enabled") ?? "false") === "true";

  const { data, error } = await supabase
    .from("fans")
    .update({ public_profile_enabled: publicProfileEnabled })
    .eq("id", user.id)
    .select("id");
  if (error || !data || data.length === 0) {
    console.error("savePrivacyAction: update failed", {
      fanId: user.id,
      code: error?.code ?? "no row",
    });
    return { ok: false, error: PRIVACY_SAVE_FAILED };
  }

  revalidatePath("/me/privacy");
  revalidatePath("/me");
  return { ok: true };
}
