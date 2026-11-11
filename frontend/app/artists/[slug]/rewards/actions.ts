"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redeemReward } from "@/lib/data/rewards";

export async function redeemRewardAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  const rewardId = formData.get("rewardId") as string;
  const deliveryDetails = (formData.get("deliveryDetails") as string) || undefined;
  // The artist page the fan is on. The database only uses it for a reward
  // with no community, and checks the fan belongs to it.
  const communitySlug = String(formData.get("communitySlug") ?? "").trim() || null;

  if (!rewardId) {
    return { error: "Invalid reward" };
  }

  const result = await redeemReward({
    rewardId,
    deliveryDetails,
    pageCommunityId: communitySlug,
  });

  if (!result.ok) {
    return { error: result.error || "Failed to redeem reward" };
  }

  // Success redirect handled via client-side toast
  return { success: true, redemptionId: result.redemptionId };
}
