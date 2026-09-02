import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMPTY_PHONE_SMS_MESSAGE,
  hasSendablePhone,
  normalizeSmsPhone,
  smsSendBlockedReason,
} from "./sms-send-gate.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("SMS send is blocked when phone is empty", () => {
  it("treats missing, blank, and whitespace as not sendable", () => {
    assert.equal(hasSendablePhone(null), false);
    assert.equal(hasSendablePhone(undefined), false);
    assert.equal(hasSendablePhone(""), false);
    assert.equal(hasSendablePhone("   "), false);
    assert.equal(hasSendablePhone("\t\n"), false);
    assert.equal(hasSendablePhone("+16155550123"), true);
    assert.equal(hasSendablePhone("  +16155550123  "), true);
  });

  it("returns clear UX copy and never yields an empty number to send", () => {
    assert.equal(smsSendBlockedReason(""), EMPTY_PHONE_SMS_MESSAGE);
    assert.equal(smsSendBlockedReason("   "), EMPTY_PHONE_SMS_MESSAGE);
    assert.equal(smsSendBlockedReason(null), EMPTY_PHONE_SMS_MESSAGE);
    assert.equal(smsSendBlockedReason("+16155550123"), null);
    assert.equal(normalizeSmsPhone("   "), null);
    assert.equal(normalizeSmsPhone(""), null);
    assert.equal(normalizeSmsPhone("+16155550123"), "+16155550123");
    assert.match(EMPTY_PHONE_SMS_MESSAGE, /phone/i);
  });

  it("onboarding Send is disabled and the SMS route rejects empty phone before Twilio", () => {
    const wizard = readRepo("../app/onboarding/onboarding-wizard.tsx");
    const route = readRepo("../app/api/fan-engage/sms/route.ts");
    assert.match(wizard, /hasSendablePhone|smsSendBlockedReason/);
    assert.match(wizard, /disabled=\{/);
    assert.match(wizard, /EMPTY_PHONE_SMS_MESSAGE|Add a phone number/);
    assert.match(route, /normalizeSmsPhone|Phone number required/);
    assert.doesNotMatch(
      wizard,
      /disabled=\{smsStatus === "loading"\}/,
    );
  });
});
