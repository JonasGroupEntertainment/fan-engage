import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_CONTACT_EMAIL,
  OFFICIAL_CONTACT_MAILTO,
  alignOfficialContactEmails,
  applyTermsSupportContact,
} from "./official-contact.ts";
import {
  applyPrivacyCounselScrub,
  privacyCounselEffectiveDate,
} from "./scrub-privacy-policy.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const LIVE_PRIVACY_EXCERPTS = [
  "This Policy was last updated on June 19, 2026.",
  "While the California Consumer Privacy Act (CCPA) primarily applies to\r\nfor-profit businesses, our privacy practices align with CCPA's goals of\r\ntransparency and security where relevant\u200b",
  "FEP processes your Personal Information to improve our Services, manage\r\naccounts, fulfill requests, accept donations, accept volunteer\r\napplications and manage volunteers, accept and process event\r\napplications, further our mission, and promote harm reduction. We\r\nprocess this information based on consent, contractual necessity, or\r\nlegitimate interests aligned with our vision.",
  "- To allow you to request services or volunteer for events;",
  "If you make a purchase or donation on the Website, you may be required",
  "Our nominated EU Representative is:\r\nFan Engage Pro Legal Team (contact@fanengagepro.com)",
  "users are able to change their personal information by emailing us at\r\ncontact@FEP.com.",
  "send an email to\r\ncontact@FEP.com.",
  "By email: contact@FEP.com",
  "CONTACT US\r\n\r\nIf you have any questions or wish to exercise your rights, please\r\ncontact us at:\r\n\r\nFan Engage Pro Legal Team\r\nEmail:",
].join("\r\n\r\n");

const DIRTY =
  /donat|volunteer|harm reduction|nonprofit|further our mission|contact@fanengagepro\.com|contact@fep\.com|support@fanengage|privacy@fanengage|legal@fanengage|June 19, 2026/i;

describe("applyPrivacyCounselScrub", () => {
  it("removes nonprofit mission language and locks contact emails on the live privacy excerpts", () => {
    const scrubbed = applyPrivacyCounselScrub(LIVE_PRIVACY_EXCERPTS);
    assert.equal(DIRTY.test(scrubbed), false);
    assert.match(scrubbed, /This Policy was last updated on September 24, 2026\./);
    assert.match(
      scrubbed,
      /The California Consumer Privacy Act \(CCPA\) applies to Fan Engage Pro as a for-profit business\./,
    );
    assert.match(
      scrubbed,
      /accept and process event applications\. We process this information based on consent, contractual necessity, or legitimate interests\./,
    );
    assert.match(scrubbed, /To allow you to request services;/);
    assert.match(scrubbed, /If you make a purchase on the Website/);
    assert.equal(
      scrubbed.includes(OFFICIAL_CONTACT_EMAIL),
      true,
    );
    assert.match(
      scrubbed,
      new RegExp(`Email: \\[${OFFICIAL_CONTACT_EMAIL}\\]\\(${OFFICIAL_CONTACT_MAILTO}\\)$`),
    );
    assert.equal(applyPrivacyCounselScrub(scrubbed), scrubbed);
  });

  it("leaves unrelated commercial sentences unchanged", () => {
    const commercial =
      "We use Stripe to process purchases for fan rewards. Points have no cash value.";
    assert.equal(applyPrivacyCounselScrub(commercial), commercial);
  });
});

describe("privacyCounselEffectiveDate", () => {
  it("moves the published June 19, 2026 effective date to the counsel update", () => {
    assert.equal(privacyCounselEffectiveDate("2026-06-19"), "2026-09-24");
    assert.equal(privacyCounselEffectiveDate("2026-09-18"), "2026-09-18");
    assert.equal(privacyCounselEffectiveDate(null), null);
  });
});

describe("official contact alignment", () => {
  it("rewrites retired public inboxes and the Terms support sentence", () => {
    const cookie = "Email: support@fanengagepro.com\n\nWe use authentication cookies.";
    const aligned = alignOfficialContactEmails(cookie);
    assert.match(aligned, new RegExp(OFFICIAL_CONTACT_MAILTO));
    assert.match(aligned, /We use authentication cookies\./);
    assert.equal(aligned.includes("support@fanengagepro.com"), false);

    const terms =
      "cancel your subscription renewal either through your online account management page or by contacting FEP customer support team; however, you will be charged";
    const withContact = applyTermsSupportContact("terms", terms);
    assert.match(withContact, new RegExp(OFFICIAL_CONTACT_MAILTO));
    assert.equal(
      applyTermsSupportContact("privacy", terms),
      terms,
    );
    assert.equal(
      applyTermsSupportContact(
        "terms",
        "submit your claim via email to bhamilton@joneskeller.com",
      ).includes("bhamilton@joneskeller.com"),
      true,
    );
  });

  it("is applied when policies load and on public contact surfaces", () => {
    const loader = readRepo("../data/policies.ts");
    assert.match(loader, /applyPrivacyCounselScrub/);
    assert.match(loader, /alignOfficialContactEmails/);
    assert.match(loader, /applyTermsSupportContact/);
    assert.match(loader, /privacyCounselEffectiveDate/);

    const footer = readRepo("../../components/footer.tsx");
    const holding = readRepo("../../app/(legal)/policy-page.tsx");
    const login = readRepo("../../app/login/login-form.tsx");
    const unsubscribe = readRepo("../../app/unsubscribe/page.tsx");
    const helpSms = readRepo("../../app/api/twilio/inbound/route.ts");
    for (const src of [footer, holding, login, unsubscribe, helpSms]) {
      assert.match(src, /OFFICIAL_CONTACT_EMAIL|OFFICIAL_CONTACT_MAILTO/);
      assert.equal(src.includes("support@fanengage.app"), false);
      assert.equal(src.includes("support@fanengagepro.com"), false);
    }
  });
});
