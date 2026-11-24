import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGE_BLOCKED_MESSAGE,
  AGE_ADULT_ONLY_MESSAGE,
  AGE_REQUIRED_MESSAGE,
  adultGate,
  ageBand,
  needsParentConsent,
  adultSmsOptIn,
  smsTextOptIn,
  birthDateReturnPath,
  ageOn,
  isAdult,
  isUnder13,
  parseBirthDate,
  parseBirthDateIso,
  toIsoDate,
} from "./age-gate.ts";

const NOW = new Date("2026-10-11T12:00:00Z");

describe("parseBirthDate", () => {
  it("accepts a real date", () => {
    const d = parseBirthDate("2000", "2", "29", NOW);
    assert.ok(d);
    assert.equal(toIsoDate(d), "2000-02-29");
  });

  it("rejects a date that does not exist", () => {
    assert.equal(parseBirthDate("2001", "2", "29", NOW), null);
    assert.equal(parseBirthDate("2001", "13", "1", NOW), null);
    assert.equal(parseBirthDate("2001", "4", "31", NOW), null);
  });

  it("rejects blank or non-numeric parts", () => {
    assert.equal(parseBirthDate("", "1", "1", NOW), null);
    assert.equal(parseBirthDate("19x0", "1", "1", NOW), null);
    assert.equal(parseBirthDate("1990", "1", "", NOW), null);
  });

  it("rejects future dates and ages over 120", () => {
    assert.equal(parseBirthDate("2027", "1", "1", NOW), null);
    assert.equal(parseBirthDate("1900", "1", "1", NOW), null);
  });
});

describe("parseBirthDateIso", () => {
  it("reads YYYY-MM-DD and rejects anything else", () => {
    assert.equal(toIsoDate(parseBirthDateIso("1990-05-01", NOW)!), "1990-05-01");
    assert.equal(parseBirthDateIso("05/01/1990", NOW), null);
    assert.equal(parseBirthDateIso(null, NOW), null);
  });
});

describe("ageOn", () => {
  it("counts a birthday that has not happened yet this year", () => {
    const dob = parseBirthDate("2008", "10", "12", NOW)!;
    assert.equal(ageOn(dob, NOW), 17);
  });

  it("counts a birthday that is today", () => {
    const dob = parseBirthDate("2008", "10", "11", NOW)!;
    assert.equal(ageOn(dob, NOW), 18);
  });
});

describe("ageBand", () => {
  it("splits under 13, teen and adult", () => {
    assert.equal(ageBand(parseBirthDate("2013", "10", "12", NOW)!, NOW), "under13");
    assert.equal(ageBand(parseBirthDate("2013", "10", "11", NOW)!, NOW), "teen");
    assert.equal(ageBand(parseBirthDate("2008", "10", "12", NOW)!, NOW), "teen");
    assert.equal(ageBand(parseBirthDate("2008", "10", "11", NOW)!, NOW), "adult");
    const teen = parseBirthDate("2013", "10", "11", NOW)!;
    const adult = parseBirthDate("2008", "10", "11", NOW)!;
    const child = parseBirthDate("2013", "10", "12", NOW)!;
    assert.equal(needsParentConsent(teen, NOW), true);
    assert.equal(needsParentConsent(adult, NOW), false);
    assert.equal(needsParentConsent(child, NOW), false);
    assert.equal(needsParentConsent(null, NOW), false);
  });

  it("has matching helpers", () => {
    const kid = parseBirthDate("2015", "1", "1", NOW)!;
    const grown = parseBirthDate("1990", "1", "1", NOW)!;
    assert.equal(isUnder13(kid, NOW), true);
    assert.equal(isAdult(kid, NOW), false);
    assert.equal(isAdult(grown, NOW), true);
    assert.equal(isAdult(null, NOW), false);
  });
});

describe("copy", () => {
  it("is neutral and uses no em dashes", () => {
    for (const text of [AGE_BLOCKED_MESSAGE, AGE_ADULT_ONLY_MESSAGE, AGE_REQUIRED_MESSAGE]) {
      assert.doesNotMatch(text, /—/);
    }
    assert.doesNotMatch(AGE_BLOCKED_MESSAGE, /13|thirteen|old enough|parent/i);
  });
});

describe("adultGate", () => {
  const now = new Date(Date.UTC(2026, 9, 11));

  it("asks for a birth date when none is stored", () => {
    assert.equal(adultGate(null, now), "required");
    assert.equal(adultGate("not-a-date", now), "required");
  });

  it("blocks a stored teen date and allows an adult one", () => {
    assert.equal(adultGate("2010-01-01", now), "adult_only");
    assert.equal(adultGate("2008-10-11", now), "ok");
    assert.equal(adultGate("2008-10-12", now), "adult_only");
  });
});

describe("birthDateReturnPath", () => {
  it("only allows known pages", () => {
    assert.equal(birthDateReturnPath("/premium"), "/premium");
    assert.equal(birthDateReturnPath("/me/notifications"), "/me/notifications");
    assert.equal(birthDateReturnPath("//evil.example"), "/");
    assert.equal(birthDateReturnPath(null), "/");
  });
});

describe("sms text opt-in", () => {
  const now = new Date("2026-10-11T12:00:00Z");

  it("lets an adult opt in without a parent tick", () => {
    assert.equal(adultSmsOptIn(true, "2000-01-01", false, now), true);
    assert.deepEqual(
      smsTextOptIn({ birthDate: "2000-01-01", requested: true, smsParentConsent: false, now }),
      { accept: true, stampConsent: false, rejected: false },
    );
  });

  it("does not block a fan with no birth date", () => {
    assert.equal(adultSmsOptIn(true, null, false, now), true);
    assert.equal(adultSmsOptIn(true, null, true, now), true);
  });

  it("refuses ages 13 to 17 until the separate parent tick", () => {
    assert.equal(adultSmsOptIn(true, "2010-05-05", true, now), false);
    assert.equal(adultSmsOptIn(true, "2010-05-05", false, now, true), true);
    assert.deepEqual(
      smsTextOptIn({ birthDate: "2010-05-05", requested: true, smsParentConsent: false, now }),
      { accept: false, stampConsent: false, rejected: true },
    );
    assert.deepEqual(
      smsTextOptIn({ birthDate: "2010-05-05", requested: true, smsParentConsent: true, now }),
      { accept: true, stampConsent: true, rejected: false },
    );
  });

  it("refuses under 13 even with the tick", () => {
    assert.deepEqual(
      smsTextOptIn({ birthDate: "2015-01-01", requested: true, smsParentConsent: true, now }),
      { accept: false, stampConsent: false, rejected: true },
    );
  });

  it("never turns it on when not requested", () => {
    assert.equal(adultSmsOptIn(false, "2000-01-01", true, now), false);
    assert.equal(adultSmsOptIn(false, "2010-05-05", true, now, true), false);
  });
});
