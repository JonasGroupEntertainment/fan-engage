import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FOUNDING_FAN_KEEP_RULE,
  FOUNDING_FAN_STATUS_SECTION,
} from "./cancellation-refund-founding-status.ts";
import {
  PRIVACY_AGE_18_BODY,
  PRIVACY_AGE_18_HEADING,
  PRIVACY_UNDER_13_BODY,
  PRIVACY_UNDER_13_HEADING,
  REWARDS_FOUNDING_FAN_REPLACEMENT,
  TERMS_FOUNDING_FAN_FORFEITURE,
  TERMS_FOUNDING_FAN_REPLACEMENT,
  applyPrivacyAgeRequirement,
  applyRewardsFoundingFanStatus,
  applyTermsFoundingFanStatus,
  applyTermsMinimumAge,
} from "./align-policy-copy.ts";
import { applyPrivacyCounselScrub } from "./scrub-privacy-policy.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const REWARDS_OLD = [
  "Founding Fan Tier. Founding Fan is a limited, one-time-only membership designation available to the first qualifying fans who purchase a Founding Fan subscription within a defined slot window established by the applicable Artists. Founding Fan status is permanent and non-transferable. Founding Fans receive: (i) locked-in subscription pricing at the rate in effect at the time of their Founding Fan purchase for the life of their active membership; (ii) a numbered Founding Fan badge displayed on their profile; (iii) access to Founder-only rewards within the applicable Artist's Rewards catalog; and (iv) recognition on the public Founder Wall page for that Artist's community. Founding Fan status is forfeited if the Founding Fan's account is closed or their Premium subscription lapses.",
].join(" ");

describe("terms and cancellation agree on Founding Fan status", () => {
  it("replaces the forfeiture sentence with the cancellation keep rule", () => {
    const next = applyTermsFoundingFanStatus(
      `Termination / Cancellation\n\n${TERMS_FOUNDING_FAN_FORFEITURE}\n\nPrice Changes`,
    );
    assert.equal(next.includes("will be forfeited"), false);
    assert.equal(next.includes("lose any Fan Engage Pro Rewards Program rewards points"), false);
    assert.equal(next.includes(FOUNDING_FAN_KEEP_RULE), true);
    assert.equal(next.includes(TERMS_FOUNDING_FAN_REPLACEMENT), true);
    assert.match(next, /Cancelling a Premium subscription does not forfeit Founding Fan status/);
    assert.match(next, /Closing the account ends Founding Fan status/);
    assert.match(next, /Price Changes/);
    assert.equal(applyTermsFoundingFanStatus(next), next);
    assert.equal(FOUNDING_FAN_STATUS_SECTION.includes(FOUNDING_FAN_KEEP_RULE), true);
  });

  it("matches the live sentence when it is wrapped", () => {
    const wrapped = TERMS_FOUNDING_FAN_FORFEITURE.replace("rewards points, and", "rewards points,\r\nand");
    const next = applyTermsFoundingFanStatus(wrapped);
    assert.equal(next.includes(FOUNDING_FAN_KEEP_RULE), true);
    assert.equal(next.includes("forfeited"), false);
  });
});

describe("terms and privacy age", () => {
  it("leaves the published 18+ terms paragraphs alone and rewrites the 13+ seed", () => {
    const published = [
      "IF YOU ARE UNDER AGE 18, YOU MAY NOT USE THIS SITE.",
      "The Services are intended for people 18 and older. You may not register as a User unless you are 18 or older.",
    ].join("\n\n");
    assert.equal(applyTermsMinimumAge(published), published);
    assert.equal(
      applyTermsMinimumAge("## 2. Eligibility\nYou must be 13 years or older to use Fan Engage.\n"),
      "## 2. Eligibility\nYou must be 18 years or older to use Fan Engage.\n",
    );
  });

  it("softens the privacy under-13 section to 18+ and does not keep parental consent", () => {
    const stored = `${PRIVACY_UNDER_13_HEADING}\r\n\r\n${PRIVACY_UNDER_13_BODY}\r\n\r\nADDITIONAL INFORMATION`;
    const next = applyPrivacyAgeRequirement(stored);
    assert.equal(next.includes(PRIVACY_AGE_18_HEADING), true);
    assert.equal(next.includes(PRIVACY_AGE_18_BODY), true);
    assert.equal(next.includes("under 13"), false);
    assert.equal(next.includes("CHILDREN UNDER"), false);
    assert.equal(next.includes("parental consent"), false);
    assert.match(next, /18 and older/);
    assert.match(next, /ADDITIONAL INFORMATION/);
    assert.equal(applyPrivacyAgeRequirement(next), next);
    const viaScrub = applyPrivacyCounselScrub(stored);
    assert.equal(viaScrub.includes(PRIVACY_AGE_18_BODY), true);
    assert.equal(applyPrivacyCounselScrub(viaScrub), viaScrub);
  });
});

describe("rewards terms Founding Fan paragraph", () => {
  it("drops paid-slot pricing and lapse forfeiture", () => {
    const next = applyRewardsFoundingFanStatus(`Points.\n\n${REWARDS_OLD}\n\nUPGRADING`);
    assert.equal(next, `Points.\n\n${REWARDS_FOUNDING_FAN_REPLACEMENT}\n\nUPGRADING`);
    assert.equal(next.includes("locked-in subscription pricing"), false);
    assert.equal(next.includes("purchase a Founding Fan subscription"), false);
    assert.equal(next.includes("Premium subscription lapses"), false);
    assert.equal(next.includes(FOUNDING_FAN_KEEP_RULE), true);
    assert.match(next, /Cancelling Premium does not forfeit Founding Fan status/);
    assert.equal(applyRewardsFoundingFanStatus(next), next);
  });
});

describe("0097_policy_copy_alignment", () => {
  const sql = readRepo("../../../supabase/migrations/0097_policy_copy_alignment.sql");
  const executable = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("updates the three policy rows and does not create a table", () => {
    assert.equal(sql.includes(TERMS_FOUNDING_FAN_REPLACEMENT), true);
    assert.equal(sql.includes(REWARDS_FOUNDING_FAN_REPLACEMENT), true);
    assert.equal(sql.includes(PRIVACY_AGE_18_HEADING), true);
    assert.equal(sql.includes(PRIVACY_AGE_18_BODY), true);
    assert.match(sql, /slug = 'terms'/);
    assert.match(sql, /slug = 'privacy'/);
    assert.match(sql, /slug = 'rewards_terms'/);
    assert.match(sql, /\[support@fanengagepro\.com\]\(mailto:support@fanengagepro\.com\)/);
    assert.match(executable, /raymond@jonasgroup\.com/);
    assert.doesNotMatch(executable, /create table/i);
    assert.doesNotMatch(executable, /carla@jonasgroup\.com/);
    assert.doesNotMatch(executable, /bhamilton@joneskeller\.com/);
    assert.doesNotMatch(executable, /grant /i);
  });

  it("is applied when those policies load", () => {
    const loader = readRepo("../data/policies.ts");
    assert.match(loader, /applyTermsFoundingFanStatus/);
    assert.match(loader, /applyTermsMinimumAge/);
    assert.match(loader, /applyRewardsFoundingFanStatus/);
    assert.match(loader, /applyPrivacyCounselScrub/);
  });
});
