import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SMS_MOBILE_OPT_IN_NO_SHARE_SENTENCE } from "./scrub-privacy-policy.ts";
import { applyStoredSmsVendorName } from "./sms-vendor-name.ts";

describe("stored policy vendor name", () => {
  it("replaces the seeded Twilio vendor and leaves the 10DLC sentence intact", () => {
    const seeded =
      "We do not sell your data. We share it only with service providers (Supabase, Mailchimp, Twilio) as needed to operate the platform.";
    const rewritten = applyStoredSmsVendorName(`${seeded}\n\n${SMS_MOBILE_OPT_IN_NO_SHARE_SENTENCE}`);
    assert.match(rewritten, /\(Supabase, Mailchimp\)/);
    assert.equal(rewritten.includes("Twilio"), false);
    assert.match(rewritten, /mobile opt-in data will not be shared with third parties/);
    assert.equal(
      applyStoredSmsVendorName("Points have no cash value."),
      "Points have no cash value.",
    );
  });
});
