import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cancel a pending redemption and refund its stored point cost once.
 *
 * All the work happens in the cancel_redemption() SQL function (migration
 * 0063): row lock, pending-only check, community check, one refund ledger
 * row with no multiplier, total resync. Callers pass the admin client and,
 * unless the caller is a super admin, the community they are allowed to act
 * on. The refund amount never comes from the browser.
 */
export async function cancelRedemption(
  admin: SupabaseClient,
  redemptionId: string,
  communityId: string | null,
): Promise<
  { success: true; refunded: number; error?: undefined } | { success?: undefined; error: string }
> {
  if (!redemptionId) return { error: "Missing redemption id" };

  const { data, error } = await admin.rpc("cancel_redemption", {
    p_redemption_id: redemptionId,
    p_community_id: communityId,
  });

  if (error) return { error: error.message };
  return { success: true, refunded: (data as number | null) ?? 0 };
}
