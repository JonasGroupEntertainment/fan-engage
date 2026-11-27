import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WEEKS_SHOWN,
  formatWeekLabel,
  newYorkMidnightIso,
  recentWeeks,
  weekIndexOf,
  weekStartDate,
  weekWindow,
} from "./weeks.ts";

const HOUR_MS = 60 * 60 * 1000;
const hoursBetween = (fromIso: string, toIso: string) =>
  (Date.parse(toIso) - Date.parse(fromIso)) / HOUR_MS;

describe("newYorkMidnightIso", () => {
  it("is 05:00 UTC in winter (EST)", () => {
    assert.equal(newYorkMidnightIso("2026-11-16"), "2026-11-16T05:00:00.000Z");
    assert.equal(newYorkMidnightIso("2026-01-05"), "2026-01-05T05:00:00.000Z");
  });

  it("is 04:00 UTC in summer (EDT)", () => {
    assert.equal(newYorkMidnightIso("2026-07-06"), "2026-07-06T04:00:00.000Z");
  });

  it("uses the offset in force at midnight on a day the clocks change", () => {
    // Spring forward happens at 2am on Sunday 2026-03-08: midnight is still EST.
    assert.equal(newYorkMidnightIso("2026-03-08"), "2026-03-08T05:00:00.000Z");
    // Fall back happens at 2am on Sunday 2026-11-01: midnight is still EDT.
    assert.equal(newYorkMidnightIso("2026-11-01"), "2026-11-01T04:00:00.000Z");
  });

  it("rejects a date it cannot read", () => {
    assert.throws(() => newYorkMidnightIso("not-a-date"), /date/i);
  });
});

describe("weekStartDate", () => {
  it("returns the Monday of the week", () => {
    const sunday = new Date("2026-11-22T17:00:00.000Z");
    assert.equal(weekStartDate(weekIndexOf(sunday)), "2026-11-16");
    const monday = new Date("2026-11-16T05:00:00.000Z");
    assert.equal(weekStartDate(weekIndexOf(monday)), "2026-11-16");
  });

  it("crosses a year boundary", () => {
    const newYearsDay = new Date("2027-01-01T17:00:00.000Z");
    assert.equal(weekStartDate(weekIndexOf(newYearsDay)), "2026-12-28");
  });
});

describe("weekWindow", () => {
  it("runs Monday 00:00 to the next Monday 00:00, New York time", () => {
    const index = weekIndexOf(new Date("2026-11-18T17:00:00.000Z"));
    const week = weekWindow(index, index);
    assert.equal(week.startDate, "2026-11-16");
    assert.equal(week.endDate, "2026-11-22");
    assert.equal(week.startIso, "2026-11-16T05:00:00.000Z");
    assert.equal(week.endIso, "2026-11-23T05:00:00.000Z");
    assert.equal(week.inProgress, true);
  });

  it("is one hour short in the week the clocks spring forward", () => {
    const index = weekIndexOf(new Date("2026-03-04T17:00:00.000Z"));
    const week = weekWindow(index, index + 1);
    assert.equal(week.startIso, "2026-03-02T05:00:00.000Z");
    assert.equal(week.endIso, "2026-03-09T04:00:00.000Z");
    assert.equal(hoursBetween(week.startIso, week.endIso), 167);
    assert.equal(week.inProgress, false);
  });

  it("is one hour long in the week the clocks fall back", () => {
    const index = weekIndexOf(new Date("2026-10-28T17:00:00.000Z"));
    const week = weekWindow(index, index + 3);
    assert.equal(week.startIso, "2026-10-26T04:00:00.000Z");
    assert.equal(week.endIso, "2026-11-02T05:00:00.000Z");
    assert.equal(hoursBetween(week.startIso, week.endIso), 169);
  });

  it("gives the same week for instants on either side of a boundary", () => {
    const index = weekIndexOf(new Date("2026-10-28T17:00:00.000Z"));
    const week = weekWindow(index, index);
    const lastInstant = new Date(Date.parse(week.endIso) - 1);
    const firstOfNext = new Date(week.endIso);
    const firstInstant = new Date(week.startIso);
    const lastOfPrevious = new Date(Date.parse(week.startIso) - 1);
    assert.equal(weekIndexOf(firstInstant), index);
    assert.equal(weekIndexOf(lastInstant), index);
    assert.equal(weekIndexOf(firstOfNext), index + 1);
    assert.equal(weekIndexOf(lastOfPrevious), index - 1);
  });
});

describe("recentWeeks", () => {
  const now = new Date("2026-11-22T20:00:00.000Z"); // Sunday afternoon in New York

  it("returns eight weeks by default, newest first", () => {
    const weeks = recentWeeks(now);
    assert.equal(weeks.length, WEEKS_SHOWN);
    assert.equal(WEEKS_SHOWN, 8);
    assert.deepEqual(
      weeks.map((w) => w.startDate),
      [
        "2026-11-16",
        "2026-11-09",
        "2026-11-02",
        "2026-10-26",
        "2026-10-19",
        "2026-10-12",
        "2026-10-05",
        "2026-09-28",
      ],
    );
  });

  it("marks only the current week as in progress", () => {
    const weeks = recentWeeks(now);
    assert.deepEqual(
      weeks.map((w) => w.inProgress),
      [true, false, false, false, false, false, false, false],
    );
  });

  it("each week ends exactly where the next one starts", () => {
    const weeks = recentWeeks(now);
    weeks.slice(1).forEach((older, i) => assert.equal(older.endIso, weeks[i].startIso));
  });

  it("late Sunday night in New York is still the same week", () => {
    const lateSunday = new Date("2026-11-23T04:59:00.000Z"); // 11:59pm EST Sunday
    assert.equal(recentWeeks(lateSunday)[0].startDate, "2026-11-16");
    const justMonday = new Date("2026-11-23T05:00:00.000Z");
    assert.equal(recentWeeks(justMonday)[0].startDate, "2026-11-23");
  });

  it("rejects a week count below one", () => {
    assert.throws(() => recentWeeks(now, 0), /at least 1/);
  });
});

describe("formatWeekLabel", () => {
  it("names the Monday and the Sunday", () => {
    const index = weekIndexOf(new Date("2026-11-18T17:00:00.000Z"));
    assert.equal(formatWeekLabel(weekWindow(index, index)), "Nov 16 to Nov 22");
  });

  it("reads across a month change", () => {
    const index = weekIndexOf(new Date("2026-10-28T17:00:00.000Z"));
    assert.equal(formatWeekLabel(weekWindow(index, index)), "Oct 26 to Nov 1");
  });
});
