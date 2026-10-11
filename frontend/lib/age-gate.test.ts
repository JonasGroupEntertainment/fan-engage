import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGE_BLOCKED_MESSAGE,
  AGE_ADULT_ONLY_MESSAGE,
  AGE_REQUIRED_MESSAGE,
  adultGate,
  ageBand,
  adultSmsOptIn,
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

describe("adultSmsOptIn", () => {
  const now = new Date("2026-10-11T12:00:00Z");

  it("allows a new opt-in for a known adult", () => {
    assert.equal(adultSmsOptIn(true, "2000-01-01", false, now), true);
  });

  it("blocks a new opt-in with no birth date", () => {
    assert.equal(adultSmsOptIn(true, null, false, now), false);
  });

  it("keeps an existing opt-in with no birth date (grandfathered)", () => {
    assert.equal(adultSmsOptIn(true, null, true, now), true);
  });

  it("always turns it off for a known under-18", () => {
    assert.equal(adultSmsOptIn(true, "2010-05-05", true, now), false);
  });

  it("never turns it on when not requested", () => {
    assert.equal(adultSmsOptIn(false, "2000-01-01", true, now), false);
  });
});
