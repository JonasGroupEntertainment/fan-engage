import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { applyTermsColoradoEntityFacts } from "./correct-terms-entity-facts.ts";
import {
  TERMS_ELIGIBLE_TRIAL,
  TERMS_MONTHLY_OR_YEARLY_BILLING,
  applyItem4PolicyCopy,
  applyRewardsPlaceholderLinks,
  applyTermsPremiumBilling,
} from "./premium-billing-wording.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const STORED = [
  "You will be billed in advance on a recurring and periodic basis. Billing cycles are set on a monthly basis, depending on the type of subscription plan you select when purchasing a subscription.",
  "In addition, you will be billed monthly for any Services that you purchase from FEP, including messaging usage, add-on subscriptions, one-time charges, and any other applicable costs, fees and charges.",
  "We will begin billing your payment method for the Services on the day that you sign up for such Services, regardless of whether you have fully completed your account as of that date.",
  "Your payment method will automatically be charged recurring renewal fees on the first day of the renewal term unless you cancel your subscription.",
  "If you terminate or cancel your subscription you will lose any Fan Engage Pro Rewards Program rewards points, and if you were a Founding Fan, your Founding Fan status will be forfeited.",
  "SUBSCRIPTION FEES AND OTHER FEES, CHARGES AND COSTS ARE NONREFUNDABLE.",
  "IF YOU ARE UNDER AGE 18, YOU MAY NOT USE THIS SITE.",
  "a $5.00 monthly credit applied to the User's account each billing cycle",
].join("\n\n");

describe("terms premium billing wording", () => {
  it("replaces monthly-only cycles and signup-day billing with the trial sentence", () => {
    const next = applyTermsPremiumBilling(STORED);
    assert.equal(next.includes("set on a monthly basis"), false);
    assert.equal(next.includes("on the day that you sign up"), false);
    assert.equal(next.includes(TERMS_MONTHLY_OR_YEARLY_BILLING), true);
    assert.equal(next.includes(TERMS_ELIGIBLE_TRIAL), true);
    assert.match(next, /depending on the type of subscription plan you select/);
    assert.equal(applyTermsPremiumBilling(next), next);
  });

  it("matches the signup-day sentence when it is wrapped", () => {
    const wrapped = STORED.replace(
      "on the day that you sign up",
      "on the day that you\r\nsign up",
    );
    const next = applyTermsPremiumBilling(wrapped);
    assert.equal(next.includes(TERMS_ELIGIBLE_TRIAL), true);
    assert.equal(next.includes("sign up for such Services"), false);
  });

  it("leaves add-on monthly billing, refunds, age, founding, and the $5 credit", () => {
    const next = applyTermsPremiumBilling(STORED);
    assert.match(
      next,
      /you will be billed monthly for any Services that you purchase from FEP, including messaging usage/,
    );
    assert.match(next, /first day of the renewal term/);
    assert.match(next, /Founding Fan status will be forfeited/);
    assert.match(next, /ARE NONREFUNDABLE/);
    assert.match(next, /UNDER AGE 18/);
    assert.match(next, /\$5\.00 monthly credit/);
  });

  it("is applied to terms, rewards terms, and cancellation, and not to privacy", () => {
    const loader = readRepo("../data/policies.ts");
    assert.match(
      loader,
      /policy\.slug === "terms" \|\|\s+policy\.slug === "rewards_terms" \|\|\s+policy\.slug === "cancellation_refund"[\s\S]*applyItem4PolicyCopy/,
    );
    assert.equal(applyItem4PolicyCopy("privacy", STORED), STORED);
    assert.doesNotMatch(loader, /applyItem4PolicyCopy\("privacy"/);
  });
});

const REWARDS = [
  "Fan Engage Pro LLC, a North Carolina limited liability company",
  "laws of the State of North Carolina",
  "The place of the arbitration and each in person hearing shall be Colorado.",
  "The Fan Engage Pro Rules for Use and User Content [link] also apply to the Fan Engage Pro Reward Program.",
  "The [link] for upgrade to Premium access and the cancellation/refund policy are located at [/cancellation-refund] on the platform.",
  "The Fan Engage Pro Terms of Use [here, provide link] and the Fan Engage Pro Rules for Use and User Content [link] also apply.",
  "described in our Privacy Policy [link].",
  "a $5.00 monthly credit applied to the User's account each billing cycle, redeemable toward marketplace items within that Artist's community.",
  "Refunds are available within 30 days of a new subscription purchase if you have not substantially used the service.",
  "See {{rules_url}} and [Example](https://example.com/rules) and [Top](#).",
].join("\n\n");

describe("item 4 policy copy", () => {
  it("states the trial and the Colorado entity, and drops credit and Rules for Use", () => {
    const next = applyItem4PolicyCopy("rewards_terms", REWARDS);
    assert.equal(next.includes("North Carolina limited liability company"), false);
    assert.match(next, /laws of the State of North Carolina/);
    assert.match(next, /arbitration and each in person hearing shall be North Carolina/);
    assert.doesNotMatch(next, /arbitration and each in person hearing shall be Colorado/);
    assert.equal(next.includes(TERMS_ELIGIBLE_TRIAL), true);
    assert.equal(next.includes("$5"), false);
    assert.equal(next.includes("store credit"), false);
    assert.equal(next.includes("each billing cycle"), false);
    assert.equal(next.includes("Rules for Use"), false);
    assert.equal(next.includes("no public page is published"), false);
    assert.equal(next.includes("within 30 days of a new subscription"), false);
    assert.equal(next.includes("[link]"), false);
    assert.equal(next.includes("[here, provide link]"), false);
    assert.equal(next.includes("example.com"), false);
    assert.equal(next.includes("{{"), false);
    assert.equal(next.includes("](#)"), false);
    assert.match(next, /\[Terms of Use\]\(\/terms\) also apply/);
    assert.match(next, /\[Premium\]\(\/premium\)/);
    assert.match(next, /\[cancellation and refund policy\]\(\/cancellation-refund\)/);
    assert.doesNotMatch(next, /\(\/premium\)\(\/premium\)/);
    assert.match(next, /\[Privacy Policy\]\(\/privacy\)/);
    assert.equal(applyItem4PolicyCopy("rewards_terms", next), next);
  });

  it("maps only routes that exist, and does not invent Rules for Use", () => {
    const app = fileURLToPath(new URL("../../app/", import.meta.url));
    for (const route of [
      "premium/page.tsx",
      "cancellation-refund/page.tsx",
      "terms/page.tsx",
      "privacy/page.tsx",
      "rewards-terms/page.tsx",
      "help/page.tsx",
      "rewards/page.tsx",
      "account/billing/page.tsx",
    ]) {
      assert.equal(existsSync(`${app}${route}`), true, route);
    }
    assert.equal(existsSync(`${app}rules/page.tsx`), false);
    const linked = applyRewardsPlaceholderLinks(
      "The Fan Engage Pro Rules for Use and User Content [link] also apply to the Fan Engage Pro Reward Program.",
    );
    assert.equal(linked.includes("Rules for Use"), false);
    assert.equal(linked.includes("no public page is published"), false);
    assert.equal(linked.trim(), "");
  });

  it("sets governing law to North Carolina and leaves the Colorado entity and North Carolina arbitration", () => {
    const stored = [
      `Fan Engage Pro LLC, a Colorado limited liability company ("we," "us" or "FEP").`,
      `This Agreement will be governed by and construed in accordance with the laws of the State of Colorado, without giving effect to any principles of conflicts of laws.`,
      `The place of the arbitration and each in person hearing shall be North Carolina.`,
    ].join("\n\n");
    for (const slug of ["terms", "rewards_terms", "cancellation_refund"]) {
      const next = applyItem4PolicyCopy(slug, applyTermsColoradoEntityFacts(slug, stored));
      assert.match(next, /Fan Engage Pro LLC, a Colorado limited liability company/);
      assert.equal(next.includes("a North Carolina limited liability company"), false);
      assert.match(
        next,
        /governed by and construed in accordance with the laws of the State of North Carolina/,
      );
      assert.equal(next.includes("laws of the State of Colorado"), false);
      assert.match(
        next,
        /The place of the arbitration and each in person hearing shall be North Carolina\./,
      );
      assert.doesNotMatch(next, /shall be Colorado/);
      assert.equal(applyItem4PolicyCopy(slug, next), next);
    }
  });

  it("does not rewrite governing law or venue on privacy", () => {
    const privacy = [
      `Residents of certain states, including California, Colorado, Connecticut, Utah, and Virginia (the "States") may have additional rights.`,
      `This Agreement will be governed by and construed in accordance with the laws of the State of Colorado, without giving effect to any principles of conflicts of laws.`,
      `The place of the arbitration and each in person hearing shall be Colorado.`,
    ].join("\n\n");
    assert.equal(applyItem4PolicyCopy("privacy", privacy), privacy);
  });

  it("publish SQL matches the live governing-law and arbitration sentences", () => {
    const sql = readRepo("../../../docs/reviews/item4-policy-copy.sql");
    const governingFrom = sql.indexOf("'laws of the State of Colorado'");
    const governingTo = sql.indexOf("'laws of the State of North Carolina'");
    assert.ok(governingFrom !== -1 && governingTo > governingFrom);
    const venueFrom = sql.indexOf(
      "'The place of the arbitration and each in person hearing shall be Colorado.'",
    );
    const venueTo = sql.indexOf(
      "'The place of the arbitration and each in person hearing shall be North Carolina.'",
    );
    assert.ok(venueFrom !== -1 && venueTo > venueFrom);
    const entityFrom = sql.indexOf("'a North Carolina limited liability company'");
    const entityTo = sql.indexOf("'a Colorado limited liability company'");
    assert.ok(entityFrom !== -1 && entityTo > entityFrom);
    assert.equal(
      sql.includes("'a Colorado limited liability company',\n  'a North Carolina limited liability company'"),
      false,
    );
    assert.match(sql, /slug in \('terms', 'rewards_terms', 'cancellation_refund'\)/);
    assert.match(sql, /Privacy \(slug = 'privacy'\) is not updated/);
    const applied = readRepo("../../../supabase/migrations/0058_terms_colorado_entity.sql");
    assert.match(
      applied,
      /'laws of the State of North Carolina',\s+'laws of the State of Colorado'/,
      "0058 is the merged migration and still writes Colorado governing law; do not edit it",
    );
    assert.match(
      applied,
      /shall be North Carolina\.',\s+'The place of the arbitration and each in person hearing shall be Colorado\.'/,
      "0058 is the merged migration and still writes a Colorado arbitration place; do not edit it",
    );
  });

  it("adds the same premium facts to cancellation without a stored trial sentence", () => {
    const next = applyItem4PolicyCopy(
      "cancellation_refund",
      "Fan Engage does not offer refunds for partial billing periods.",
    );
    assert.equal(next.includes(TERMS_ELIGIBLE_TRIAL), true);
    assert.equal(next.includes("$5"), false);
    assert.equal(next.includes("store credit"), false);
    assert.match(next, /does not offer refunds for partial billing periods/);
    assert.match(next, /Colorado limited liability company/);
  });
});
