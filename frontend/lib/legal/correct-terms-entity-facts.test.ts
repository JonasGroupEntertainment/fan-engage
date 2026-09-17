import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyTermsColoradoEntityFacts,
  TERMS_ENTITY_FACT_REPLACEMENTS,
} from "./correct-terms-entity-facts.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const LIVE_TERMS_EXCERPTS = [
  `This Terms of Use is a legal contract between you, the user of this website ("you," "your" or "User"), and Fan Engage Pro LLC, a North Carolina limited liability company ("we," "us" or "FEP").`,
  `This Agreement will be governed by and construed in accordance with the laws of the State of North Carolina, without giving effect to any principles of conflicts of laws.`,
  `The place of the arbitration and each in person hearing shall be North Carolina. The arbitrator may award the same damages to you as a court could.`,
].join("\n\n");

const UNRELATED_POLICY = `Residents of certain states, including California, Colorado, Connecticut, Utah, and Virginia (the "States") may have additional rights. Fan Engage Pro LLC, a North Carolina limited liability company.`;

describe("applyTermsColoradoEntityFacts", () => {
  it("maps the three published NC entity/law/venue phrases to Colorado on terms only", () => {
    const corrected = applyTermsColoradoEntityFacts("terms", LIVE_TERMS_EXCERPTS);
    assert.equal(corrected.includes("North Carolina"), false);
    assert.match(
      corrected,
      /Fan Engage Pro LLC, a Colorado limited liability company/,
    );
    assert.match(corrected, /laws of the State of Colorado/);
    assert.match(
      corrected,
      /The place of the arbitration and each in person hearing shall be Colorado\./,
    );
    assert.equal(
      TERMS_ENTITY_FACT_REPLACEMENTS.length,
      3,
      "keep the replacement list limited to the three published facts",
    );
  });

  it("does not rewrite Privacy or Rewards Terms even if they still say North Carolina", () => {
    assert.equal(
      applyTermsColoradoEntityFacts("privacy", UNRELATED_POLICY),
      UNRELATED_POLICY,
    );
    assert.equal(
      applyTermsColoradoEntityFacts("rewards_terms", UNRELATED_POLICY),
      UNRELATED_POLICY,
    );
  });

  it("leaves a Belmont, NC notices address unchanged on terms", () => {
    const withNotice =
      LIVE_TERMS_EXCERPTS +
      "\n\nNotices: 300 Poplar St, Belmont, NC 28012.";
    const corrected = applyTermsColoradoEntityFacts("terms", withNotice);
    assert.match(corrected, /300 Poplar St, Belmont, NC 28012/);
    assert.equal(corrected.includes("North Carolina"), false);
  });

  it("is applied when policy_pages terms are loaded for /terms and signup", () => {
    const loader = readRepo("../data/policies.ts");
    assert.match(loader, /applyTermsColoradoEntityFacts/);
    assert.match(loader, /function applyPublishedPolicyFacts/);
    const termsPage = readRepo("../../app/terms/page.tsx");
    assert.match(termsPage, /PolicyPage slug="terms"/);
    const signup = readRepo("../../app/signup/page.tsx");
    assert.match(signup, /getPolicy\("terms"\)/);
    assert.match(signup, /getPolicy\("privacy"\)/);
  });
});
