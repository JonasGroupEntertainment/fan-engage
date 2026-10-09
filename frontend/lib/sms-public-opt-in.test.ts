import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SMS_CONSENT_TEXT, publicSmsOptIn } from "./sms-public-opt-in.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("SMS consent copy", () => {
  it("is the Mailchimp disclosure, with Terms and Privacy Policy in the sentence", () => {
    assert.equal(
      SMS_CONSENT_TEXT,
      "Yes, text me about artist drops, events, meet and greets, and rewards from Fan Engage Pro. Message frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Consent is not a condition of purchase. See our Terms and Privacy Policy.",
    );
    const marker = "See our Terms and Privacy Policy.";
    const head = SMS_CONSENT_TEXT.slice(0, SMS_CONSENT_TEXT.indexOf(marker));
    assert.equal(`${head}See our Terms and Privacy Policy.`, SMS_CONSENT_TEXT);
  });

  it("links Terms to /terms and Privacy Policy to /privacy on the public pages and onboarding", () => {
    const copy = readRepo("../components/sms-consent-copy.tsx");
    assert.match(copy, /href="\/terms"/);
    assert.match(copy, /href="\/privacy"/);
    assert.match(copy, />\s*Terms\s*</);
    assert.match(copy, />\s*Privacy Policy\s*</);

    const signup = readRepo("../app/signup/signup-form.tsx");
    const smsPage = readRepo("../app/sms/sms-opt-in-form.tsx");
    const wizard = readRepo("../app/onboarding/onboarding-wizard.tsx");
    const footer = readRepo("../components/footer.tsx");
    for (const src of [signup, smsPage, wizard]) {
      assert.match(src, /SmsConsentCopy/);
      assert.doesNotMatch(src, /I consent to receive SMS from Fan Engage/);
    }
    assert.match(footer, /href="\/sms"/);
    assert.match(readRepo("../app/sms/page.tsx"), /Text alerts/);
  });
});

describe("public SMS opt-in", () => {
  it("keeps phone and SMS optional, and ignores the box without a number", () => {
    assert.deepEqual(publicSmsOptIn(false, ""), {
      phone: null,
      smsOptedIn: false,
      error: null,
    });
    assert.deepEqual(publicSmsOptIn(false, "   "), {
      phone: null,
      smsOptedIn: false,
      error: null,
    });
    assert.deepEqual(publicSmsOptIn(true, ""), {
      phone: null,
      smsOptedIn: false,
      error: null,
    });
    assert.deepEqual(publicSmsOptIn(true, null), {
      phone: null,
      smsOptedIn: false,
      error: null,
    });
  });

  it("opts in only when the box is ticked and the phone normalizes", () => {
    assert.deepEqual(publicSmsOptIn(true, "(615) 555-0123"), {
      phone: "+16155550123",
      smsOptedIn: true,
      error: null,
    });
    assert.deepEqual(publicSmsOptIn(false, "+1 615 555 0123"), {
      phone: "+16155550123",
      smsOptedIn: false,
      error: null,
    });
  });

  it("rejects a non-blank phone that is not usable", () => {
    const bad = publicSmsOptIn(true, "123");
    assert.equal(bad.smsOptedIn, false);
    assert.equal(bad.phone, null);
    assert.equal(typeof bad.error, "string");
  });

  it("signup phone is optional, the box starts unchecked, and account creation does not require either", () => {
    const signup = readRepo("../app/signup/signup-form.tsx");
    assert.match(signup, /const \[smsConsent, setSmsConsent\] = useState\(false\)/);
    assert.match(signup, /name="phone"/);
    assert.doesNotMatch(signup, /name="phone"[\s\S]{0,240}required/);
    assert.doesNotMatch(signup, /name="sms-consent"[\s\S]{0,160}required/);
    assert.doesNotMatch(signup, /defaultChecked/);
    assert.match(signup, /publicSmsOptIn\(smsConsent, phone\)/);
    assert.match(signup, /persistSignupChannelOptIn\(/);
  });
});
