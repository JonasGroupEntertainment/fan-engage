import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMUNITY_EARN_RULES,
  FREE_V1_FEATURES,
  freeCommunityEarnCopy,
  isAiDrafterFreeForCommunity,
  parseAiDrafterFreeCommunities,
  PREMIUM_CTA,
  PREMIUM_V1_FEATURES,
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
  merchAccess,
  merchGuestLoginHref,
  merchGuestSignupHref,
  MERCH_PATH,
  type MembershipEntitlement,
} from "./entitlements-core.ts";
import { guestSignupHref } from "./guest-signup.ts";

function entitlement(
  overrides: Partial<MembershipEntitlement> = {},
): MembershipEntitlement {
  return {
    fanId: "fan-1",
    communityId: "raelynn",
    tier: "free",
    isPremium: false,
    isFounder: false,
    founderNumber: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    monthlyCreditCents: 0,
    billingPeriod: null,
    ...overrides,
  };
}

describe("shared isPremium helper", () => {
  it("treats premium, comped, and past_due as Premium", () => {
    assert.equal(isPremium("premium"), true);
    assert.equal(isPremium("comped"), true);
    assert.equal(isPremium("past_due"), true);
    assert.equal(isPremiumTier("premium"), true);
  });

  it("treats free, cancelled, empty, and missing as Free", () => {
    assert.equal(isPremium("free"), false);
    assert.equal(isPremium("cancelled"), false);
    assert.equal(isPremium(null), false);
    assert.equal(isPremium(undefined), false);
    assert.equal(isPremium(""), false);
  });

  it("reads membership rows and entitlement objects", () => {
    assert.equal(isPremium({ subscription_tier: "premium" }), true);
    assert.equal(isPremium({ tier: "comped" }), true);
    assert.equal(isPremium({ isPremium: true, tier: "free" }), true);
    assert.equal(isPremium({ isPremium: false, tier: "premium" }), false);
    assert.equal(
      isPremium(entitlementFromMembershipRow({
        fan_id: "a",
        community_id: "raelynn",
        subscription_tier: "past_due",
      })),
      true,
    );
  });
});

describe("Free vs Premium v1 matrix", () => {
  it("keeps browse/read/profile/legal/points on the Free path", () => {
    for (const feature of FREE_V1_FEATURES) {
      assert.equal(isFreeFeature(feature), true);
      assert.equal(canUseFeature(feature, null), true);
      assert.equal(canUseFeature(feature, "free"), true);
    }
  });

  it("gates the locked Premium unlocks behind isPremium", () => {
    for (const feature of PREMIUM_V1_FEATURES) {
      assert.equal(canUsePremiumFeature(feature, null), false);
      assert.equal(canUsePremiumFeature(feature, "free"), false);
      assert.equal(canUsePremiumFeature(feature, "cancelled"), false);
      assert.equal(canUsePremiumFeature(feature, "premium"), true);
      assert.equal(canUsePremiumFeature(feature, "comped"), true);
      assert.equal(canUsePremiumFeature(feature, "past_due"), true);
    }
  });

  it("locks the exact Free and Premium sets (status is earned, not bought)", () => {
    assert.deepEqual(
      [...FREE_V1_FEATURES].sort(),
      [
        "basic_profile",
        "browse_artists",
        "browse_events",
        "challenge_entry",
        "community_react",
        "community_reply",
        "community_vote",
        "legal_pages",
        "points_earn",
        "read_community",
      ],
    );
    assert.deepEqual(
      [...PREMIUM_V1_FEATURES].sort(),
      [
        "ai_comment_drafter",
        "billing_portal",
        "community_post",
        "merch_drops",
        "premium_badge",
        "referral_extras",
        "rewards_redeem",
      ],
    );
    // Nothing is in both lists.
    for (const f of FREE_V1_FEATURES) {
      assert.equal((PREMIUM_V1_FEATURES as readonly string[]).includes(f), false);
    }
  });

  it("replies, reactions, votes and challenge entries never need Premium", () => {
    for (const feature of ["community_reply", "community_react", "community_vote", "challenge_entry"] as const) {
      assert.equal(canUseFeature(feature, null), true);
      assert.equal(canUseFeature(feature, "free"), true);
      assert.equal(canUseFeature(feature, "cancelled"), true);
    }
    assert.equal(canUseFeature("community_post", "free"), false);
    assert.equal(canUseFeature("community_post", "premium"), true);
  });

  it("earn copy mirrors the SQL caps and names what is Free", () => {
    assert.deepEqual(COMMUNITY_EARN_RULES.reply, { points: 10, dailyCap: 5 });
    assert.deepEqual(COMMUNITY_EARN_RULES.vote, { points: 10, dailyCap: 3 });
    assert.equal(COMMUNITY_EARN_RULES.challengeEntry.points, 3);
    assert.equal(COMMUNITY_EARN_RULES.post.premium, true);
    const copy = freeCommunityEarnCopy();
    assert.match(copy, /^Free for every fan:/);
    assert.match(copy, /comments \+10 pts \(up to 5\/day\)/);
    assert.match(copy, /votes \+10 pts \(up to 3\/day\)/);
    assert.match(copy, /challenge entries \+3 pts/);
    assert.match(copy, /Starting a post \(\+5 pts\) is Premium/);
    assert.doesNotMatch(copy, /member|club|brand/i);
  });

  it("AI drafter flag parses slugs and wildcard", () => {
    assert.deepEqual(parseAiDrafterFreeCommunities(undefined), { all: false, slugs: new Set() });
    assert.equal(isAiDrafterFreeForCommunity("raelynn", undefined), false);
    assert.equal(isAiDrafterFreeForCommunity("raelynn", ""), false);
    assert.equal(isAiDrafterFreeForCommunity("raelynn", "raelynn"), true);
    assert.equal(isAiDrafterFreeForCommunity("raelynn", " other , RaeLynn "), true);
    assert.equal(isAiDrafterFreeForCommunity("raelynn", "other"), false);
    assert.equal(isAiDrafterFreeForCommunity("raelynn", "*"), true);
    assert.equal(isAiDrafterFreeForCommunity("anything", "other,*"), true);
    assert.equal(isAiDrafterFreeForCommunity("", "*"), false);
    assert.equal(isAiDrafterFreeForCommunity(null, "*"), false);
  });

  it("marks merch drops as Premium-only catalog items", () => {
    assert.equal(isMerchDropReward({ is_drop: true, kind: "custom" }), true);
    assert.equal(isMerchDropReward({ is_drop: false, kind: "merch_discount" }), true);
    assert.equal(isMerchDropReward({ is_drop: false, kind: "voice_note" }), false);
  });
});

describe("canAccess content visibility", () => {
  it("always allows public community reads", () => {
    assert.deepEqual(canAccess("public", null), {
      allowed: true,
      reason: "public",
    });
    assert.deepEqual(canAccess("public", entitlement()), {
      allowed: true,
      reason: "public",
    });
  });

  it("paywalls premium content for Free viewers", () => {
    assert.equal(canAccess("premium", null).reason, "signed-out");
    assert.equal(canAccess("premium", entitlement()).reason, "needs-premium");
    assert.equal(
      canAccess("premium", entitlement({ isPremium: true, tier: "premium" }))
        .allowed,
      true,
    );
  });
});

describe("locked CTA copy", () => {
  it("uses the Raymond-greenlit strings and /premium href", () => {
    assert.equal(PREMIUM_CTA.available, "Available with Premium");
    assert.equal(PREMIUM_CTA.unlock, "Unlock this with Premium.");
    assert.equal(PREMIUM_CTA.upgrade, "Upgrade to Premium");
    assert.equal(PREMIUM_CTA.manageBilling, "Manage billing");
    assert.equal(PREMIUM_CTA.href, "/premium");
    assert.equal(premiumPath("raelynn"), "/premium?c=raelynn");
    assert.equal(paywallReason(null), "signed-out");
    assert.equal(paywallReason(entitlement()), "needs-premium");
  });
});

describe("merch three-way click gate", () => {
  it("sends guests to signup/login, not merch", () => {
    const guest = merchAccess({ signedIn: false, isPremium: false });
    assert.equal(guest.allowed, false);
    assert.equal(guest.reason, "signed-out");
    assert.equal(guest.navHref, merchGuestSignupHref());
    assert.equal(
      merchGuestSignupHref(),
      guestSignupHref({ next: MERCH_PATH }),
    );
    assert.equal(
      merchGuestLoginHref(),
      `/login?next=${encodeURIComponent(MERCH_PATH)}`,
    );
    assert.equal(guest.navHref.startsWith("/signup"), true);
    assert.equal(guest.loginHref, merchGuestLoginHref());
    assert.notEqual(guest.navHref, MERCH_PATH);
  });

  it("sends signed-in Free to merch with a Premium CTA, not signup", () => {
    const free = merchAccess({ signedIn: true, isPremium: false });
    assert.equal(free.allowed, false);
    assert.equal(free.reason, "needs-premium");
    assert.equal(free.navHref, MERCH_PATH);
    assert.doesNotMatch(free.navHref, /\/signup/);
    assert.doesNotMatch(free.navHref, /\/login/);
    assert.equal(PREMIUM_CTA.href, "/premium");
  });

  it("opens merch for Premium", () => {
    const premium = merchAccess({ signedIn: true, isPremium: true });
    assert.equal(premium.allowed, true);
    assert.equal(premium.reason, "premium-member");
    assert.equal(premium.navHref, MERCH_PATH);
  });
});
