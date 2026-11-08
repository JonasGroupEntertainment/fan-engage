import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  TERMS_ELIGIBLE_TRIAL,
  TERMS_MONTHLY_OR_YEARLY_BILLING,
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

  it("runs only from the terms branch of policy loading", () => {
    const loader = readRepo("../data/policies.ts");
    const termsBranch = loader.slice(loader.indexOf('policy.slug === "terms"'));
    assert.match(termsBranch, /applyTermsPremiumBilling/);
    assert.doesNotMatch(
      loader.slice(loader.indexOf('policy.slug === "rewards_terms"'), loader.indexOf('policy.slug === "privacy"')),
      /applyTermsPremiumBilling/,
    );
  });
});
