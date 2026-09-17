import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canUsePremiumFeature,
  entitlementFromMembershipRow,
  isPremium,
  type MembershipEntitlement,
  type PremiumV1Feature,
} from "@/lib/entitlements-core";

export {
  PREMIUM_V1_FEATURES,
  FREE_V1_FEATURES,
  PREMIUM_CTA,
  canAccess,
  canUseFeature,
  canUsePremiumFeature,
  entitlementFromMembershipRow,
  isFreeFeature,
  isMerchDropReward,
  isPremium,
  isPremiumTier,
  paywallReason,
  premiumPath,
  type FreeV1Feature,
  type MembershipEntitlement,
  type PremiumV1Feature,
  type SubscriptionTier,
} from "@/lib/entitlements-core";

const MEMBERSHIP_SELECT =
  "fan_id, community_id, subscription_tier, is_founder, founder_number, current_period_end, cancel_at_period_end, monthly_credit_cents, billing_period";

/**
 * Fetch the current viewer's entitlement for a specific community. Returns
 * null if signed out, or if no membership row exists. Uses the admin
 * client so RLS doesn't interfere — entitlement checks MUST be exhaustive
 * across all fans/communities regardless of RLS scoping.
 */
export async function getEntitlement(
  fanId: string,
  communityId: string,
): Promise<MembershipEntitlement | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("fan_community_memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("fan_id", fanId)
    .eq("community_id", communityId)
    .maybeSingle();

  if (!data) return null;
  return entitlementFromMembershipRow(data as Parameters<typeof entitlementFromMembershipRow>[0]);
}

/**
 * Shortcut for the most common call pattern — read the current signed-in
 * viewer's entitlement for the currently-scoped community. Returns null if
 * signed out. Safe to call in any server component.
 */
export async function getViewerEntitlement(
  communityId: string,
): Promise<MembershipEntitlement | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return await getEntitlement(user.id, communityId);
  } catch {
    return null;
  }
}

/**
 * Premium in any community — used for the nav badge, billing portal, and
 * profile badge. Membership is still per-community for write gates.
 */
export async function getFanPremiumMemberships(
  fanId: string,
): Promise<MembershipEntitlement[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("fan_community_memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("fan_id", fanId)
    .in("subscription_tier", ["premium", "comped", "past_due"]);

  return (data ?? []).map((row) =>
    entitlementFromMembershipRow(
      row as Parameters<typeof entitlementFromMembershipRow>[0],
    ),
  );
}

export async function fanIsPremiumAnywhere(fanId: string): Promise<boolean> {
  const rows = await getFanPremiumMemberships(fanId);
  return rows.some((row) => isPremium(row));
}

export async function getViewerPremiumAnywhere(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    return await fanIsPremiumAnywhere(user.id);
  } catch {
    return false;
  }
}

export type PremiumGateResult =
  | { allowed: true; entitlement: MembershipEntitlement | null }
  | { allowed: false; reason: "signed-out" | "needs-premium" };

/**
 * Server-action/API gate for a v1 Premium feature in one community.
 */
export async function requirePremiumFeature(
  fanId: string,
  communityId: string,
  feature: PremiumV1Feature,
): Promise<PremiumGateResult> {
  // v1: every Premium unlock uses the same isPremium membership signal.
  const entitlement = await getEntitlement(fanId, communityId);
  if (canUsePremiumFeature(feature, entitlement)) {
    return { allowed: true, entitlement };
  }
  return {
    allowed: false,
    reason: entitlement ? "needs-premium" : "signed-out",
  };
}

/**
 * Platform-wide Premium gate (billing portal, nav badge).
 */
export async function requirePremiumAnywhere(
  fanId: string,
): Promise<PremiumGateResult> {
  const memberships = await getFanPremiumMemberships(fanId);
  const entitlement = memberships.find((row) => isPremium(row)) ?? null;
  if (entitlement) {
    return { allowed: true, entitlement };
  }
  return { allowed: false, reason: "needs-premium" };
}
