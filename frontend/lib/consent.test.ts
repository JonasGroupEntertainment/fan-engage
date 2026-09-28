import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONSENT_VERSION,
  onboardConsentUpdates,
  parseConsentTimestamp,
} from "./consent.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const NOW = new Date("2026-09-27T18:00:00Z");
const PHONE = "+16155550123";

describe("CONSENT_VERSION", () => {
  it("is the current published version", () => {
    assert.equal(CONSENT_VERSION, "2026-08-01.v1");
  });

  it("is the only source of the version in signup and onboarding", () => {
    const signup = readRepo("../app/signup/signup-form.tsx");
    const wizard = readRepo("../app/onboarding/onboarding-wizard.tsx");
    const route = readRepo("../app/api/fan-engage/onboard/route.ts");
    assert.match(signup, /import \{ CONSENT_VERSION \} from "@\/lib\/consent"/);
    for (const src of [signup, wizard, route]) {
      assert.doesNotMatch(src, /\d{4}-\d{2}-\d{2}\.v\d/);
    }
    assert.doesNotMatch(wizard, /consentVersion/);
  });
});

describe("parseConsentTimestamp", () => {
  it("accepts a real past timestamp and normalizes it", () => {
    assert.equal(
      parseConsentTimestamp("2026-09-27T17:59:00.000Z", NOW),
      "2026-09-27T17:59:00.000Z",
    );
  });

  it("allows small clock skew but rejects the far future", () => {
    assert.ok(parseConsentTimestamp("2026-09-27T18:04:00Z", NOW));
    assert.equal(parseConsentTimestamp("2026-09-27T18:30:00Z", NOW), null);
  });

  it("rejects junk, empty, and non-strings", () => {
    for (const v of ["", "  ", "yesterday", "not a date", 123, true, {}, null, undefined]) {
      assert.equal(parseConsentTimestamp(v, NOW), null);
    }
  });
});

describe("onboardConsentUpdates", () => {
  it("opts in to SMS only with the ticked box, the flag, and a phone", () => {
    const yes = onboardConsentUpdates({ smsOptedIn: true, smsConsent: true }, PHONE, NOW);
    assert.deepEqual(yes, { ok: true, smsOptedIn: true });

    for (const [input, phone] of [
      [{ smsOptedIn: true }, PHONE],
      [{ smsOptedIn: true, smsConsent: false }, PHONE],
      [{ smsOptedIn: true, smsConsent: "true" }, PHONE],
      [{ smsOptedIn: false, smsConsent: true }, PHONE],
      [{ smsOptedIn: true, smsConsent: true }, null],
      [{ smsOptedIn: true, smsConsent: true }, "  "],
    ] as const) {
      const r = onboardConsentUpdates(input, phone, NOW);
      assert.equal(r.ok, true);
      assert.equal(r.ok && r.smsOptedIn, false);
    }
  });

  it("leaves stored consent untouched when no time is sent", () => {
    const r = onboardConsentUpdates({}, PHONE, NOW);
    assert.deepEqual(r, { ok: true, smsOptedIn: false });
  });

  it("stores the client's real time with the server's version", () => {
    const r = onboardConsentUpdates({ consentAcceptedAt: "2026-09-27T17:00:00Z" }, null, NOW);
    assert.deepEqual(r, {
      ok: true,
      smsOptedIn: false,
      consent: {
        consent_accepted_at: "2026-09-27T17:00:00.000Z",
        consent_version: CONSENT_VERSION,
      },
    });
  });

  it("rejects an invalid time instead of inventing one", () => {
    const r = onboardConsentUpdates({ consentAcceptedAt: "garbage" }, PHONE, NOW);
    assert.equal(r.ok, false);
  });
});

describe("onboard route and wizard consent wiring", () => {
  it("route uses onboardConsentUpdates and never invents a consent time", () => {
    const route = readRepo("../app/api/fan-engage/onboard/route.ts");
    assert.match(route, /onboardConsentUpdates\(/);
    assert.match(route, /sms_opted_in: consent\.smsOptedIn/);
    assert.match(route, /smsEnabledFromOnboarding\(consent\.smsOptedIn/);
    assert.doesNotMatch(route, /consent_accepted_at:\s*new Date\(\)/);
    assert.doesNotMatch(route, /payload\.consentVersion/);
  });

  it("wizard sends the time the Terms box was ticked and the SMS box state", () => {
    const wizard = readRepo("../app/onboarding/onboarding-wizard.tsx");
    assert.match(wizard, /setTosConsentAt\(e\.target\.checked \? new Date\(\)\.toISOString\(\) : null\)/);
    assert.match(wizard, /smsConsent: textsConsented/);
    assert.doesNotMatch(wizard, /consentAcceptedAt: new Date\(\)/);
    assert.doesNotMatch(wizard, /smsOptedIn: true/);
  });
});
