import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { COMMUNITY_EARN_RULES } from "./entitlements-core.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("v1 Premium gates on UI + APIs", () => {
  it("only the top-level post composer requires the shared Premium helper", () => {
    const actions = readRepo("../app/artists/[slug]/community/actions.ts");
    const predictions = readRepo("../app/artists/[slug]/community/predictions-actions.ts");
    assert.match(actions, /requirePremiumFeature/);
    assert.match(actions, /createPostAction[\s\S]*requirePremiumCommunityWrite\(userId, artistSlug, "community_post"\)/);
    // Exactly one gate call site: createPostAction. Replies, reactions,
    // poll votes and challenge entries are Free.
    assert.equal(
      (actions.match(/await requirePremiumCommunityWrite\(/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(actions, /"community_reply"/);
    assert.doesNotMatch(actions, /"community_react"/);
    for (const fn of ["toggleReactionAction", "addCommentAction", "votePollAction", "submitEntryAction"]) {
      const start = actions.indexOf(`export async function ${fn}(`);
      assert.notEqual(start, -1, `${fn} exists`);
      const end = actions.indexOf("export async function", start + 1);
      const bodyText = actions.slice(start, end === -1 ? undefined : end);
      assert.doesNotMatch(bodyText, /requirePremium/, `${fn} has no Premium gate`);
      assert.match(bodyText, /requireUser\(\)/, `${fn} still requires sign-in`);
    }
    assert.doesNotMatch(predictions, /requirePremiumFeature/);
    assert.match(predictions, /redirect\("\/login"\)/);
  });

  it("community UI keeps the Free read path, Free engagement, and paywalls the composer", () => {
    const page = readRepo("../app/artists/[slug]/community/page.tsx");
    const card = readRepo("../app/artists/[slug]/community/post-card.tsx");
    const poll = readRepo("../app/artists/[slug]/community/poll-block.tsx");
    const challenge = readRepo("../app/artists/[slug]/community/challenge-block.tsx");
    assert.match(page, /canUsePremiumFeature\("community_post"/);
    assert.match(page, /PremiumLockNote/);
    assert.match(page, /const canEngage = isSignedIn/);
    assert.match(page, /canReply=\{canEngage\}/);
    assert.match(page, /canReact=\{canEngage\}/);
    // Header earn copy is truthful for Free fans and matches the SQL caps.
    const r = COMMUNITY_EARN_RULES;
    assert.match(page, /Free for every fan:/);
    assert.match(page, new RegExp(`comments \\+${r.reply.points} pts \\(up to ${r.reply.dailyCap}/day\\)`));
    assert.match(page, new RegExp(`votes \\+${r.vote.points} pts \\(up to ${r.vote.dailyCap}/day\\)`));
    assert.match(page, new RegExp(`challenge entries \\+${r.challengeEntry.points}\\s+pts`));
    assert.match(page, new RegExp(`Starting a post \\(\\+${r.post.points} pts\\) is Premium`));
    assert.doesNotMatch(page, /Posts \+5 pts · comments \+10 pts/);
    // No Premium upsell on react / reply / vote / enter controls.
    for (const src of [card, poll, challenge]) {
      assert.doesNotMatch(src, /PremiumCta/);
      assert.doesNotMatch(src, /PREMIUM_CTA/);
      assert.doesNotMatch(src, /premiumPath/);
    }
    assert.match(card, /Sign in to react/);
  });

  it("AI comment drafter is Premium unless AI_DRAFTER_FREE_COMMUNITIES opens the community", () => {
    const route = readRepo("../app/api/ai/draft-comment/route.ts");
    assert.match(route, /AI_DRAFTER_FREE_COMMUNITIES/);
    assert.match(route, /isAiDrafterFreeForCommunity\(communityId\)/);
    assert.match(route, /requirePremiumFeature\(user\.id, communityId, "ai_comment_drafter"\)/);
    assert.doesNotMatch(route, /"community_reply"/);
    assert.match(route, /apiRateLimiter\.check\(user\.id\)/);
  });

  it("/premium perks do not claim replies, reactions or votes are Premium", () => {
    const premium = readRepo("../app/premium/page.tsx");
    assert.match(premium, /Replies, reactions, poll votes and challenge entries are free for every fan/);
    assert.match(premium, /Post your own threads/);
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

  it("Stripe billing portal opens for any Stripe customer and Manage billing copy is gated", () => {
    const billingAction = readRepo("../app/account/billing/actions.ts");
    const billingPage = readRepo("../app/account/billing/page.tsx");
    const menu = readRepo("../components/user-menu.tsx");
    const me = readRepo("../app/me/page.tsx");
    const premium = readRepo("../app/premium/page.tsx");
    // Lapsed or canceled fans still need invoices, so no Premium gate here.
    assert.doesNotMatch(billingAction, /requirePremiumAnywhere/);
    assert.match(billingAction, /stripe_customer_id/);
    assert.match(billingAction, /PREMIUM_CTA\.href/);
    assert.equal(
      (billingPage.match(/action=\{openBillingPortalAction\}/g) ?? []).length,
      2,
      "portal form shows for Premium and for non-Premium customers",
    );
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

  it("merch nav is labeled Unlocks until physical merch ships, and three-way gated", () => {
    const layout = readRepo("../app/layout.tsx");
    const market = readRepo("../app/marketplace/page.tsx");
    const offers = readRepo("./data/offers.ts");
    assert.match(layout, /label: "Unlocks"/);
    assert.doesNotMatch(layout, /label: "Merch"/);
    assert.doesNotMatch(layout, /Merch Soon|Merch soon/);
    assert.match(layout, /merchAccess/);
    assert.match(market, /merchAccess/);
    assert.match(market, /redirect\(access\.navHref\)/);
    assert.match(market, /PremiumLockNote/);
    assert.match(market, /PREMIUM_CTA/);
    assert.match(offers, /category !== "merch"/);
    assert.match(offers, /merch_drops/);
  });
});
