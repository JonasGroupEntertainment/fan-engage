"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRedemption } from "@/lib/rewards/cancel";
import { assertPortalRole } from "@/lib/artist-portal/access";

/** Editors and above may fulfill/cancel (PORTAL_MIN_ROLE.redemptions). Throws. */
async function requireEditor() {
  const ctx = await assertPortalRole("redemptions");
  return { communityId: ctx.communityId };
}

export async function fulfillRedemptionAction(formData: FormData) {
  const { communityId } = await requireEditor();
  const redemptionId = String(formData.get("redemption_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!redemptionId) return { error: "Missing redemption_id" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reward_redemptions")
    .update({
      status: "fulfilled",
      fulfillment_note: note || null,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", redemptionId)
    .eq("community_id", communityId);

  if (error) return { error: error.message };
  revalidatePath("/artist-portal/redemptions");
  return { success: true as const };
}

export async function cancelRedemptionPortalAction(formData: FormData) {
  const { communityId } = await requireEditor();
  const redemptionId = String(formData.get("redemption_id") ?? "").trim();
  if (!redemptionId) return { error: "Missing redemption_id" };

  const result = await cancelRedemption(createAdminClient(), redemptionId, communityId);
  if ("error" in result) return { error: result.error };

  revalidatePath("/artist-portal/redemptions");
  return { success: true as const };
}
