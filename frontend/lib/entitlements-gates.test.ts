import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("v1 Premium gates on UI + APIs", () => {
  it("community writes require the shared Premium helper", () => {
    const actions = readRepo("../app/artists/[slug]/community/actions.ts");
    assert.match(actions, /requirePremiumFeature/);
    assert.match(actions, /community_post/);
    assert.match(actions, /community_reply/);
    assert.match(actions, /community_react/);
    assert.match(actions, /createPostAction[\s\S]*community_post/);
    assert.match(actions, /addCommentAction[\s\S]*community_reply/);
    assert.match(actions, /toggleReactionAction[\s\S]*community_react/);
  });

  it("community UI keeps the Free read path and paywalls writes", () => {
    const page = readRepo("../app/artists/[slug]/community/page.tsx");
    const card = readRepo("../app/artists/[slug]/community/post-card.tsx");
    assert.match(page, /canUsePremiumFeature\("community_post"/);
    assert.match(page, /PremiumLockNote/);
    assert.match(page, /canReply=\{canWrite\}/);
    assert.match(page, /canReact=\{canWrite\}/);
    assert.match(card, /canReply = false/);
    assert.match(card, /PREMIUM_CTA\.unlock/);
    assert.match(card, /premiumPath\(post\.artist_slug\)/);
  });

  it("redeem API and merch drops are Premium-gated", () => {
    const rewards = readRepo("./data/rewards.ts");
    const card = readRepo("../app/artists/[slug]/rewards/reward-card.tsx");
    const page = readRepo("../app/artists/[slug]/rewards/page.tsx");
    assert.match(rewards, /requirePremiumFeature/);
    assert.match(rewards, /merch_drops/);
    assert.match(rewards, /PREMIUM_CTA\.unlock/);
    assert.match(page, /canUsePremiumFeature\("rewards_redeem"/);
    assert.match(card, /canRedeem/);
    assert.match(card, /isMerchDropReward/);
    assert.match(card, /PREMIUM_CTA\.unlock/);
  });

  it("Stripe billing portal is Premium-only and Manage billing copy is gated", () => {
    const billingAction = readRepo("../app/account/billing/actions.ts");
    const billingPage = readRepo("../app/account/billing/page.tsx");
    const menu = readRepo("../components/user-menu.tsx");
    const me = readRepo("../app/me/page.tsx");
    const premium = readRepo("../app/premium/page.tsx");
    assert.match(billingAction, /requirePremiumAnywhere/);
    assert.match(billingAction, /PREMIUM_CTA\.href/);
    assert.match(billingPage, /isPremiumFan/);
    assert.match(billingPage, /PREMIUM_CTA\.manageBilling/);
    assert.match(menu, /isPremium \?/);
    assert.match(menu, /PREMIUM_CTA\.manageBilling/);
    assert.match(menu, /PREMIUM_CTA\.upgrade/);
    assert.match(me, /getViewerPremiumAnywhere/);
    assert.match(me, /PREMIUM_CTA\.manageBilling/);
    assert.match(premium, /isPremium &&/);
    assert.match(premium, /PREMIUM_CTA\.manageBilling/);
  });

  it("locked CTA copy is used by the paywall and upgrade controls", () => {
    const paywall = readRepo("../components/premium-paywall.tsx");
    const cta = readRepo("../components/premium-cta.tsx");
    assert.match(paywall, /PREMIUM_CTA\.upgrade/);
    assert.match(paywall, /PREMIUM_CTA\.unlock/);
    assert.match(paywall, /PREMIUM_CTA\.available/);
    assert.doesNotMatch(paywall, /Upgrade to Premium — \$10/);
    assert.match(cta, /premiumPath/);
    assert.match(cta, /copy = "upgrade"/);
  });

  it("Premium badge stays hidden unless isPremium is true", () => {
    const badge = readRepo("../components/premium-badge.tsx");
    const profile = readRepo("../app/fans/[slug]/page.tsx");
    assert.match(badge, /if \(!show \|\| !isPremium\) return null/);
    assert.match(badge, /PREMIUM_CTA\.billingHref/);
    assert.match(profile, /isPremium=\{profile\.isPremium\}/);
    assert.match(profile, /href=\{null\}/);
  });

  it("wired referral extras are Premium-gated", () => {
    const referrals = readRepo("../app/referrals/page.tsx");
    assert.match(referrals, /Referral extras/);
    assert.match(referrals, /getViewerPremiumAnywhere/);
    assert.match(referrals, /PREMIUM_CTA\.available/);
    assert.match(referrals, /1\.5×/);
  });
});
