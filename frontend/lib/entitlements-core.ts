/**
 * Fan Engage Pro — Free vs Premium v1 (Raymond-greenlit matrix).
 *
 * Pure helpers with no Next/Supabase imports so unit tests can exercise
 * the same isPremium signal the UI and APIs use.
 *
 * Free (always): browse artists/events, basic profile, read community,
 * legal pages, and limited points earn if already present.
 *
 * Premium unlocks: community post/reply/react; rewards redeem; Premium
 * badge; referral extras if wired; Stripe billing portal; merch drops.
 */

export type SubscriptionTier =
  | "free"
  | "premium"
  | "comped"
  | "past_due"
  | "cancelled";

export interface MembershipEntitlement {
  fanId: string;
  communityId: string;
  tier: SubscriptionTier;
  isPremium: boolean;
  isFounder: boolean;
  founderNumber: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  monthlyCreditCents: number;
  billingPeriod: "monthly" | "annual" | null;
}

/** Locked v1 Premium capabilities. */
export const PREMIUM_V1_FEATURES = [
  "community_post",
  "community_reply",
  "community_react",
  "rewards_redeem",
  "premium_badge",
  "referral_extras",
  "billing_portal",
  "merch_drops",
] as const;

export type PremiumV1Feature = (typeof PREMIUM_V1_FEATURES)[number];

/** Locked v1 Free capabilities — never require a paid membership. */
export const FREE_V1_FEATURES = [
  "browse_artists",
  "browse_events",
  "basic_profile",
  "read_community",
  "legal_pages",
  "points_earn",
] as const;

export type FreeV1Feature = (typeof FREE_V1_FEATURES)[number];

/**
 * Locked CTA copy. Upgrade links go to /premium. "Manage billing" is only
 * shown when the viewer is already Premium.
 */
export const PREMIUM_CTA = {
  available: "Available with Premium",
  unlock: "Unlock this with Premium.",
  upgrade: "Upgrade to Premium",
  manageBilling: "Manage billing",
  href: "/premium",
  billingHref: "/account/billing",
} as const;

export function premiumPath(communityId?: string | null): string {
  if (!communityId) return PREMIUM_CTA.href;
  return `${PREMIUM_CTA.href}?c=${encodeURIComponent(communityId)}`;
}

/**
 * Returns true if the tier grants Premium-level access. 'past_due' counts
 * because Stripe is still retrying — we keep access until Stripe gives up
 * and fires subscription.deleted, which flips the row to 'cancelled'.
 */
export function isPremiumTier(
  tier: SubscriptionTier | string | null | undefined,
): boolean {
  return tier === "premium" || tier === "comped" || tier === "past_due";
}

type PremiumSignal =
  | SubscriptionTier
  | string
  | null
  | undefined
  | {
      isPremium?: boolean;
      tier?: SubscriptionTier | string | null;
      subscription_tier?: SubscriptionTier | string | null;
    };

/**
 * Shared Premium helper. Accepts a membership row, entitlement object, or
 * raw subscription_tier string. Null/undefined is Free.
 */
export function isPremium(source: PremiumSignal): boolean {
  if (source == null) return false;
  if (typeof source === "string") return isPremiumTier(source);
  if (typeof source.isPremium === "boolean") return source.isPremium;
  if (source.tier != null) return isPremiumTier(source.tier);
  if (source.subscription_tier != null) {
    return isPremiumTier(source.subscription_tier);
  }
  return false;
}

export function entitlementFromMembershipRow(row: {
  fan_id: string;
  community_id: string;
  subscription_tier?: string | null;
  is_founder?: boolean | null;
  founder_number?: number | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  monthly_credit_cents?: number | null;
  billing_period?: string | null;
}): MembershipEntitlement {
  const tier = (row.subscription_tier as SubscriptionTier | null) ?? "free";
  return {
    fanId: row.fan_id,
    communityId: row.community_id,
    tier,
    isPremium: isPremium(tier),
    isFounder: Boolean(row.is_founder),
    founderNumber: row.founder_number ?? null,
    currentPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    monthlyCreditCents: row.monthly_credit_cents ?? 0,
    billingPeriod:
      row.billing_period === "monthly" || row.billing_period === "annual"
        ? row.billing_period
        : null,
  };
}

/**
 * Decide whether a viewer can see a specific piece of content. Abstracts
 * the matrix of (viewer tier × content tag) so callers don't have to
 * re-derive it. Returns { allowed, reason } where reason is a short string
 * useful for analytics / paywall UX copy.
 *
 * Matrix:
 * - 'public': always allowed
 * - 'premium': allowed if viewer is premium/comped/past_due; else 'needs-premium'
 *             or 'signed-out' if not authenticated
 * - 'founder-only': allowed only if viewer has is_founder=true; else
 *                   'needs-founder' if authenticated but not a founder, or
 *                   'signed-out' if not authenticated
 */
export function canAccess(
  contentTier: "public" | "premium" | "founder-only",
  viewer: MembershipEntitlement | null,
): {
  allowed: boolean;
  reason:
    | "public"
    | "premium-member"
    | "founder-member"
    | "needs-premium"
    | "needs-founder"
    | "signed-out";
} {
  if (contentTier === "public") {
    return { allowed: true, reason: "public" };
  }

  if (!viewer) {
    return { allowed: false, reason: "signed-out" };
  }

  if (contentTier === "founder-only") {
    if (viewer.isFounder) {
      return { allowed: true, reason: "founder-member" };
    }
    return { allowed: false, reason: "needs-founder" };
  }

  if (isPremium(viewer)) {
    return { allowed: true, reason: "premium-member" };
  }
  return { allowed: false, reason: "needs-premium" };
}

/** Free v1 surfaces are never Premium-gated. */
export function isFreeFeature(feature: FreeV1Feature | PremiumV1Feature): boolean {
  return (FREE_V1_FEATURES as readonly string[]).includes(feature);
}

/**
 * v1 capability check. Free features always pass. Premium features pass
 * only when the shared isPremium helper is true.
 */
export function canUsePremiumFeature(
  feature: PremiumV1Feature,
  viewer: PremiumSignal,
): boolean {
  return isPremium(viewer);
}

export function canUseFeature(
  feature: FreeV1Feature | PremiumV1Feature,
  viewer: PremiumSignal,
): boolean {
  if (isFreeFeature(feature)) return true;
  return canUsePremiumFeature(feature as PremiumV1Feature, viewer);
}

/** Merch drops are Premium-only in v1 (catalog browse stays Free). */
export function isMerchDropReward(reward: {
  is_drop?: boolean | null;
  kind?: string | null;
}): boolean {
  return reward.is_drop === true || reward.kind === "merch_discount";
}

export function paywallReason(
  viewer: MembershipEntitlement | null,
): "signed-out" | "needs-premium" {
  return viewer ? "needs-premium" : "signed-out";
}
