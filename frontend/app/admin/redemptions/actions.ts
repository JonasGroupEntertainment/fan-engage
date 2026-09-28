"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRedemption } from "@/lib/rewards/cancel";
import { getAdminContext } from "@/lib/admin";
import { redirect } from "next/navigation";
import { notifyRedemptionFulfilled } from "@/lib/notifications/triggers/redemption-fulfilled";

export async function markFulfilledAction(redemptionId: string, fulfillmentNote: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reward_redemptions")
    .update({
      status: "fulfilled",
      fulfillment_note: fulfillmentNote || null,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", redemptionId)
    .eq("community_id", ctx.currentCommunityId || "");

  if (error) {
    return { error: error.message };
  }

  // Notify the fan. Best-effort; never block the action.
  try {
    const { data: redemption } = await supabase
      .from("reward_redemptions")
      .select("fan_id, rewards(name, artist_slug)")
      .eq("id", redemptionId)
      .maybeSingle();
    if (redemption) {
      const reward = (redemption as { rewards?: { name?: string; artist_slug?: string } }).rewards;
      notifyRedemptionFulfilled({
        fanId: redemption.fan_id as string,
        redemptionId,
        rewardName: reward?.name ?? "Your reward",
        artistSlug: reward?.artist_slug,
        fulfillmentNote: fulfillmentNote || undefined,
      }).catch(() => {});
    }
  } catch {
    /* no-op */
  }

  return { success: true };
}

export async function cancelRedemptionAction(redemptionId: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  // Super admins can cancel in any community; everyone else only in theirs.
  const scope = ctx.isSuperAdmin ? null : ctx.currentCommunityId;
  if (!ctx.isSuperAdmin && !scope) return { error: "Unauthorized" };

  return cancelRedemption(createAdminClient(), redemptionId, scope);
}
