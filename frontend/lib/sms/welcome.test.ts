import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SMS_WELCOME_MESSAGE, smsRecipientForFan } from "./welcome.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

describe("smsRecipientForFan", () => {
  it("refuses a fan with no recorded opt-in", () => {
    for (const fan of [
      null,
      { phone: "+16155550123", sms_opted_in: false },
      { phone: "+16155550123", sms_opted_in: null },
    ]) {
      const r = smsRecipientForFan(fan);
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.status, 403);
    }
  });

  it("refuses a missing or non-E.164 stored number", () => {
    for (const phone of [null, "", "6155550123", "+0123", "(615) 555-0123"]) {
      const r = smsRecipientForFan({ phone, sms_opted_in: true });
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.status, 400);
    }
  });

  it("returns the fan's own stored number when opted in", () => {
    assert.deepEqual(smsRecipientForFan({ phone: "+16155550123", sms_opted_in: true }), {
      ok: true,
      phone: "+16155550123",
    });
  });
});

describe("SMS welcome wording", () => {
  it("is fixed and carries the required opt-out language", () => {
    assert.match(SMS_WELCOME_MESSAGE, /STOP to opt out/);
    assert.match(SMS_WELCOME_MESSAGE, /HELP/);
    assert.doesNotMatch(SMS_WELCOME_MESSAGE, /\$\{/);
  });
});

describe("SMS route", () => {
  const route = readRepo("../../app/api/fan-engage/sms/route.ts");

  it("ignores the request body so a caller cannot pick the number or text", () => {
    assert.doesNotMatch(route, /request\.json\(/);
    assert.doesNotMatch(route, /req\.json\(/);
  });

  it("loads the signed-in fan's own row and sends the fixed message", () => {
    assert.match(route, /sms_opted_in/);
    assert.match(route, /smsRecipientForFan\(/);
    assert.match(route, /SMS_WELCOME_MESSAGE/);
    assert.match(route, /user\.id/);
  });

  it("wizard only sends after the SMS box is ticked, with no body", () => {
    const wizard = readRepo("../../app/onboarding/onboarding-wizard.tsx");
    assert.match(wizard, /fetch\("\/api\/fan-engage\/sms", \{ method: "POST" \}\)/);
    assert.match(wizard, /!smsConsent/);
    assert.doesNotMatch(wizard, /interest: formState\.interest,\n\s*\}\),\n\s*\}\)\.catch\(\(err\) => console\.warn\("Twilio/);
  });
});
