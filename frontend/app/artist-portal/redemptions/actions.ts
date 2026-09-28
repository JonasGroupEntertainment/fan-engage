"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRedemption } from "@/lib/rewards/cancel";

async function requireOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!adminRow) throw new Error("Forbidden");
  return { communityId: adminRow.community_id as string };
}

export async function fulfillRedemptionAction(formData: FormData) {
  const { communityId } = await requireOwner();
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
  const { communityId } = await requireOwner();
  const redemptionId = String(formData.get("redemption_id") ?? "").trim();
  if (!redemptionId) return { error: "Missing redemption_id" };

  const result = await cancelRedemption(createAdminClient(), redemptionId, communityId);
  if ("error" in result) return { error: result.error };

  revalidatePath("/artist-portal/redemptions");
  return { success: true as const };
}
