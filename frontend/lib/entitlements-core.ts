/**
 * Fan Engage Pro — Free vs Premium v1 (Raymond-greenlit matrix).
 *
 * Pure helpers with no Next/Supabase imports so unit tests can exercise
 * the same isPremium signal the UI and APIs use.
 *
 * Free (always): browse artists/events, basic profile, read community,
 * legal pages, and the whole engagement loop — replies, reactions, poll and
 * prediction votes, challenge entries — with the daily point caps that live
 * in SQL (see COMMUNITY_EARN_RULES below). Status is earned by engagement,
 * not spend (PRODUCT.md), so none of that sits behind a paywall.
 *
 * Premium unlocks: starting a top-level community post; rewards redeem;
 * Premium badge; referral extras if wired; Stripe billing portal; merch
 * (nav + /marketplace + merch drops); the AI comment drafter unless
 * AI_DRAFTER_FREE_COMMUNITIES opens it for a community.
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

/**
 * Locked v1 Premium capabilities.
 *
 * `community_post` is the top-level composer only. Replies, reactions,
 * votes and challenge entries moved to FREE_V1_FEATURES (Sprint 1) so the
 * +30% comment-lift gate in LAUNCH_CHECKLIST.md is measured on real fans,
 * not a Premium-only cohort.
 */
export const PREMIUM_V1_FEATURES = [
  "community_post",
  "rewards_redeem",
  "premium_badge",
  "referral_extras",
  "billing_portal",
  "merch_drops",
  "ai_comment_drafter",
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
  "community_reply",
  "community_react",
  "community_vote",
  "challenge_entry",
] as const;

export type FreeV1Feature = (typeof FREE_V1_FEATURES)[number];

/**
 * What a signed-in Free fan earns in the community, per action, with the
 * per-fan daily caps. These mirror the SQL award path and are display
 * copy only — the ledger triggers are the enforcement:
 *   - comments:  try_award_comment_points   (0053) +10, cap 5 per ET day
 *   - votes:     try_award_poll_points      (0053) +10, cap 3 per ET day;
 *                prediction votes share community_poll_votes, same cap
 *   - entries:   award_challenge_entry_points (0078) +3, one per challenge
 *   - reactions: no points today (no award trigger on community_reactions)
 * Posts (+5, award_community_post_points) stay Premium.
 */
export const COMMUNITY_EARN_RULES = {
  reply: { points: 10, dailyCap: 5 },
  vote: { points: 10, dailyCap: 3 },
  challengeEntry: { points: 3, dailyCap: null },
  react: { points: 0, dailyCap: null },
  post: { points: 5, dailyCap: null, premium: true },
} as const;

/** One-line earn copy for the community header, built from the rules above. */
export function freeCommunityEarnCopy(): string {
  const r = COMMUNITY_EARN_RULES;
  return (
    `Free for every fan: comments +${r.reply.points} pts (up to ${r.reply.dailyCap}/day) · ` +
    `poll & prediction votes +${r.vote.points} pts (up to ${r.vote.dailyCap}/day) · ` +
    `challenge entries +${r.challengeEntry.points} pts · reactions. ` +
    `Starting a post (+${r.post.points} pts) is Premium.`
  );
}

/**
 * AI comment drafter rollout flag.
 *
 * Env `AI_DRAFTER_FREE_COMMUNITIES` — comma-separated community slugs for
 * which Free fans may use /api/ai/draft-comment (still auth + per-fan rate
 * limited). `*` opens every community. Unset/empty keeps the drafter a
 * Premium perk. Lets the +30% comment-lift hypothesis get a Free sample.
 */
export const AI_DRAFTER_FREE_COMMUNITIES_ENV = "AI_DRAFTER_FREE_COMMUNITIES";

export function parseAiDrafterFreeCommunities(
  raw: string | null | undefined,
): { all: boolean; slugs: Set<string> } {
  const parts = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return { all: parts.includes("*"), slugs: new Set(parts.filter((s) => s !== "*")) };
}

export function isAiDrafterFreeForCommunity(
  communityId: string | null | undefined,
  raw: string | null | undefined = process.env[AI_DRAFTER_FREE_COMMUNITIES_ENV],
): boolean {
  if (!communityId) return false;
  const parsed = parseAiDrafterFreeCommunities(raw);
  return parsed.all || parsed.slugs.has(communityId.trim().toLowerCase());
}

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

/** Merch lives at /marketplace. Do not rename the route. */
export const MERCH_PATH = "/marketplace";

export function merchGuestSignupHref(): string {
  return `/signup?ref=raelynn&next=${encodeURIComponent(MERCH_PATH)}`;
}

export function merchGuestLoginHref(): string {
  return `/login?next=${encodeURIComponent(MERCH_PATH)}`;
}

export type MerchAccess = {
  allowed: boolean;
  reason: "signed-out" | "needs-premium" | "premium-member";
  /** Where the main-menu Merch item should send this viewer. */
  navHref: string;
  /** Secondary guest door. Only set when signed out. */
  loginHref?: string;
};

/**
 * Three-way merch click/route gate.
 * - Guest → signup (login is the secondary door on that page)
 * - Signed-in Free → merch route, which renders the Premium CTA (not signup)
 * - Premium → merch as it works today
 */
export function merchAccess(viewer: {
  signedIn: boolean;
  isPremium: boolean;
}): MerchAccess {
  if (!viewer.signedIn) {
    return {
      allowed: false,
      reason: "signed-out",
      navHref: merchGuestSignupHref(),
      loginHref: merchGuestLoginHref(),
    };
  }
  if (!viewer.isPremium) {
    return {
      allowed: false,
      reason: "needs-premium",
      navHref: MERCH_PATH,
    };
  }
  return {
    allowed: true,
    reason: "premium-member",
    navHref: MERCH_PATH,
  };
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

/** Merch drops are Premium-only in v1. The merch nav/route is also Premium. */
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
