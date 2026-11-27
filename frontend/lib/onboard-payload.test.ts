import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ONBOARD_BAD_FIELD_ERROR,
  ONBOARD_BAD_REQUEST_ERROR,
  isJoinComplete,
  validateOnboardPayload,
} from "./onboard-payload.ts";

describe("validateOnboardPayload", () => {
  it("accepts what the join form sends", () => {
    const body = {
      firstName: "Lyra",
      city: "Nashville, TN",
      phone: "(615) 555-0123",
      handle: "@lyra",
      musicOutlet: "Spotify",
      interest: "Music",
      referralCode: undefined,
      communitySlug: "raelynn",
      smsOptedIn: false,
      smsConsent: false,
      smsParentConsent: false,
      emailConsent: true,
      consentAcceptedAt: "2026-11-27T12:00:00.000Z",
    };
    const result = validateOnboardPayload(body);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payload.firstName, "Lyra");
  });

  it("accepts missing and null fields", () => {
    assert.equal(validateOnboardPayload({}).ok, true);
    assert.equal(validateOnboardPayload({ firstName: null, smsConsent: null }).ok, true);
  });

  it("refuses a body that is not an object", () => {
    for (const bad of [null, undefined, "x", 4, true, [], [{ firstName: "A" }]]) {
      assert.deepEqual(validateOnboardPayload(bad), { ok: false, error: ONBOARD_BAD_REQUEST_ERROR });
    }
  });

  it("refuses text fields that are not text", () => {
    for (const key of [
      "firstName",
      "lastName",
      "city",
      "phone",
      "handle",
      "musicOutlet",
      "interest",
      "referralCode",
      "communitySlug",
      "consentAcceptedAt",
    ]) {
      for (const bad of [1, true, {}, ["a"]]) {
        assert.deepEqual(
          validateOnboardPayload({ [key]: bad }),
          { ok: false, error: ONBOARD_BAD_FIELD_ERROR },
          key,
        );
      }
    }
  });

  it("refuses tick boxes that are not true or false", () => {
    for (const key of ["smsOptedIn", "smsConsent", "smsParentConsent", "emailOptedIn", "emailConsent"]) {
      for (const bad of ["true", 1, {}, []]) {
        assert.deepEqual(
          validateOnboardPayload({ [key]: bad }),
          { ok: false, error: ONBOARD_BAD_FIELD_ERROR },
          key,
        );
      }
    }
  });
});

describe("isJoinComplete", () => {
  it("needs a name and agreed Terms", () => {
    assert.equal(isJoinComplete({ firstName: "Lyra", consentAcceptedAt: "2026-11-27T12:00:00Z" }), true);
    assert.equal(isJoinComplete({ firstName: "  ", consentAcceptedAt: "2026-11-27T12:00:00Z" }), false);
    assert.equal(isJoinComplete({ firstName: null, consentAcceptedAt: "2026-11-27T12:00:00Z" }), false);
    assert.equal(isJoinComplete({ firstName: "Lyra", consentAcceptedAt: null }), false);
    assert.equal(isJoinComplete({ firstName: "Lyra", consentAcceptedAt: "" }), false);
    assert.equal(isJoinComplete({ firstName: "Lyra" }), false);
  });
});

describe("onboard route", () => {
  const source = readFileSync(
    new URL("../app/api/fan-engage/onboard/route.ts", import.meta.url),
    "utf8",
  );

  it("checks the body before reading any field", () => {
    assert.match(source, /validateOnboardPayload\(/);
    assert.ok(source.indexOf("validateOnboardPayload(") < source.indexOf("normalizePhoneE164("));
    assert.doesNotMatch(source, /await request\.json\(\)\) as OnboardPayload/);
  });

  it("pays the welcome points, referral and founding number only for a finished join", () => {
    const gate = source.indexOf("if (!joinComplete)");
    assert.ok(gate > 0);
    for (const marker of ['.eq("referral_code"', "claim_founding_fan_status", '"signup_bonus"']) {
      assert.ok(source.indexOf(marker) > gate, marker);
    }
  });
});
