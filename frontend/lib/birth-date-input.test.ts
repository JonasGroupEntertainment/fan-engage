import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  birthdayMonthFromBirthDate,
  formatBirthDateInput,
  nextBirthDateInput,
  splitBirthDateInput,
} from "./birth-date-input.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("formatBirthDateInput", () => {
  it("adds the slashes as digits are typed", () => {
    assert.equal(formatBirthDateInput(""), "");
    assert.equal(formatBirthDateInput("0"), "0");
    assert.equal(formatBirthDateInput("03"), "03/");
    assert.equal(formatBirthDateInput("031"), "03/1");
    assert.equal(formatBirthDateInput("0315"), "03/15/");
    assert.equal(formatBirthDateInput("03151985"), "03/15/1985");
  });
  it("is stable on its own output", () => {
    for (const v of ["03/", "03/1", "03/15/", "03/15/19", "03/15/1985"]) {
      assert.equal(formatBirthDateInput(v), v);
    }
  });
  it("lets the guest backspace past a slash, then carry on typing", () => {
    assert.equal(nextBirthDateInput("03/15/", "03/15"), "03/15");
    assert.equal(nextBirthDateInput("03/", "03"), "03");
    assert.equal(nextBirthDateInput("04/", "04"), "04");
    assert.equal(nextBirthDateInput("03/15", "03/151"), "03/15/1");
    assert.equal(nextBirthDateInput("03", "031"), "03/1");
    assert.equal(nextBirthDateInput("", "03151985"), "03/15/1985");
  });
  it("reads single digits and typed slashes", () => {
    assert.equal(formatBirthDateInput("3/5/1985"), "03/05/1985");
    assert.equal(formatBirthDateInput("4"), "04/");
    assert.equal(formatBirthDateInput("12/7"), "12/07/");
  });
  it("ignores letters and extra digits", () => {
    assert.equal(formatBirthDateInput("03-15-1985"), "03/15/1985");
    assert.equal(formatBirthDateInput("031519851"), "03/15/1985");
  });
});

describe("splitBirthDateInput", () => {
  it("returns the parts only when complete", () => {
    assert.deepEqual(splitBirthDateInput("03/15/1985"), { month: "03", day: "15", year: "1985" });
    assert.equal(splitBirthDateInput("03/15/19"), null);
    assert.equal(splitBirthDateInput(""), null);
  });
});

describe("birthdayMonthFromBirthDate", () => {
  it("reads the month from a stored date", () => {
    assert.equal(birthdayMonthFromBirthDate("1985-03-15"), 3);
    assert.equal(birthdayMonthFromBirthDate("1990-12-01"), 12);
    assert.equal(birthdayMonthFromBirthDate(null), null);
    assert.equal(birthdayMonthFromBirthDate("nope"), null);
  });
});

describe("where it is used", () => {
  it("sign-up has one date of birth box", () => {
    const signup = read("../app/signup/signup-form.tsx");
    assert.match(signup, /nextBirthDateInput\(/);
    assert.match(signup, /autoComplete="bday"/);
    assert.doesNotMatch(signup, /ph: "DD"/);
  });
});
