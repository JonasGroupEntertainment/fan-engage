import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INVALID_PHONE_MESSAGE,
  PHONE_INPUT_PATTERN,
  isE164,
  normalizePhoneE164,
} from "./phone.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

function expectPhone(input: string | null | undefined, expected: string | null) {
  const result = normalizePhoneE164(input);
  assert.equal(result.ok, true, `expected ${JSON.stringify(input)} to be accepted`);
  if (result.ok) assert.equal(result.phone, expected);
}

function expectRejected(input: string) {
  const result = normalizePhoneE164(input);
  assert.equal(result.ok, false, `expected ${JSON.stringify(input)} to be rejected`);
  if (!result.ok) assert.equal(result.error, INVALID_PHONE_MESSAGE);
}

describe("normalizePhoneE164 keeps phone optional", () => {
  it("returns null for missing, empty, and whitespace input", () => {
    expectPhone(null, null);
    expectPhone(undefined, null);
    expectPhone("", null);
    expectPhone("   ", null);
  });
});

describe("normalizePhoneE164 accepts and normalizes real numbers", () => {
  it("passes through a number that is already E.164", () => {
    expectPhone("+16155550123", "+16155550123");
    expectPhone("+442079460958", "+442079460958");
  });

  it("strips spaces, dots, dashes, and parentheses", () => {
    expectPhone("+1 (615) 555-0123", "+16155550123");
    expectPhone("+44 20 7946 0958", "+442079460958");
    expectPhone(" +1.615.555.0123 ", "+16155550123");
  });

  it("assumes US for a bare 10 digit number", () => {
    expectPhone("6155550123", "+16155550123");
    expectPhone("(615) 555-0123", "+16155550123");
    expectPhone("615-555-0123", "+16155550123");
  });

  it("accepts 11 digits that start with the US country code", () => {
    expectPhone("16155550123", "+16155550123");
    expectPhone("1-615-555-0123", "+16155550123");
  });

  it("converts a 00 international prefix to +", () => {
    expectPhone("0044 20 7946 0958", "+442079460958");
  });
});

describe("normalizePhoneE164 rejects junk", () => {
  it("rejects numbers that are too short or too long", () => {
    expectRejected("12345");
    expectRejected("615-555");
    expectRejected("+1234567890123456");
  });

  it("rejects letters and mixed input", () => {
    expectRejected("abc");
    expectRejected("+1615555O123");
    expectRejected("615-555-0123 ext 4");
  });

  it("rejects a country code or US area code that starts with 0 or 1", () => {
    expectRejected("+0615555012");
    expectRejected("0155550123");
    expectRejected("1155550123");
  });

  it("rejects 11 digits that do not start with 1", () => {
    expectRejected("26155550123");
  });

  it("uses a plain English message with no em dash", () => {
    assert.match(INVALID_PHONE_MESSAGE, /phone/i);
    assert.doesNotMatch(INVALID_PHONE_MESSAGE, /—/);
  });
});

describe("isE164", () => {
  it("matches the strict E.164 shape only", () => {
    assert.equal(isE164("+16155550123"), true);
    assert.equal(isE164("+12345678"), true);
    assert.equal(isE164("+123456789012345"), true);
    assert.equal(isE164("16155550123"), false);
    assert.equal(isE164("+1234567"), false);
    assert.equal(isE164("+1234567890123456"), false);
    assert.equal(isE164("+0155550123"), false);
  });
});

describe("phone validation is wired into every write path", () => {
  it("profile action validates and the form shows the shared message on a reject", () => {
    const action = readRepo("../app/me/profile/actions.ts");
    const form = readRepo("../app/me/profile/profile-form.tsx");
    assert.match(action, /normalizePhoneE164/);
    assert.match(form, /pattern=\{PHONE_INPUT_PATTERN\}/);
    assert.match(form, /INVALID_PHONE_MESSAGE/);
  });

  it("onboard route rejects an invalid phone with a 400 before writing", () => {
    const route = readRepo("../app/api/fan-engage/onboard/route.ts");
    assert.match(route, /normalizePhoneE164/);
    assert.match(route, /status: 400/);
    assert.doesNotMatch(route, /phone: payload\.phone \?\? null/);
  });

  it("sms route uses the shared normalizer instead of an inline regex", () => {
    const route = readRepo("../app/api/fan-engage/sms/route.ts");
    assert.match(route, /normalizePhoneE164/);
    assert.doesNotMatch(route, /\^\\\+\[1-9\]\\d\{7,14\}\$/);
  });

  it("onboarding wizard shows the server's phone error instead of a generic failure", () => {
    const wizard = readRepo("../app/onboarding/onboarding-wizard.tsx");
    assert.match(wizard, /finishMessage/);
  });
});

describe("PHONE_INPUT_PATTERN (browser-side pattern attribute)", () => {
  // Browsers compile the pattern attribute as ^(?:pattern)$ with the v flag.
  const browserRegex = new RegExp(`^(?:${PHONE_INPUT_PATTERN})$`, "v");

  it("accepts every shape the server normalizer accepts", () => {
    for (const value of [
      "+16155550123",
      "(615) 555-0123",
      "615-555-0123",
      "615.555.0123",
      "1 615 555 0123",
      "+44 20 7946 0958",
      "0044 20 7946 0958",
    ]) {
      assert.ok(browserRegex.test(value), `expected accept: ${value}`);
    }
  });

  it("rejects obviously bad input before the form submits", () => {
    for (const value of ["12345", "abc", "615-555-0123 x22", "+1 (615) 555-0123456789"]) {
      assert.ok(!browserRegex.test(value), `expected reject: ${value}`);
    }
  });
});
