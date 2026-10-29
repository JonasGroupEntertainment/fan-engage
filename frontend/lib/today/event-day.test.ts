import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventDayKey, isEventToday, parseEventDateText } from "./event-day.ts";

// 2026-03-14 at 20:00 Eastern (EDT, UTC-4) = 2026-03-15T00:00Z — picks a
// moment where UTC and Eastern disagree on the calendar day.
const NOW = new Date("2026-03-15T00:00:00Z");

describe("parseEventDateText", () => {
  it("parses the admin placeholder formats", () => {
    assert.equal(parseEventDateText("Mar 14, 2026", 2026), "2026-03-14");
    assert.equal(parseEventDateText("March 14, 2026", 2026), "2026-03-14");
    assert.equal(parseEventDateText("Mar 14 · 7 PM", 2026), "2026-03-14");
    assert.equal(parseEventDateText("Sat, Mar 14 · 7 PM", 2026), "2026-03-14");
    assert.equal(parseEventDateText("Mar. 14th", 2026), "2026-03-14");
    assert.equal(parseEventDateText("14 March 2026", 2026), "2026-03-14");
    assert.equal(parseEventDateText("3/14/2026", 2026), "2026-03-14");
    assert.equal(parseEventDateText("3/14/26", 2026), "2026-03-14");
    assert.equal(parseEventDateText("2026-03-14", 2026), "2026-03-14");
    assert.equal(parseEventDateText("2026-03-14T19:00", 2026), "2026-03-14");
  });

  it("uses the fallback year for year-less strings", () => {
    assert.equal(parseEventDateText("Dec 31", 2027), "2027-12-31");
  });

  it("returns null for vague or invalid text", () => {
    assert.equal(parseEventDateText("Coming soon", 2026), null);
    assert.equal(parseEventDateText("TBA", 2026), null);
    assert.equal(parseEventDateText("Summer 2026", 2026), null);
    assert.equal(parseEventDateText("—", 2026), null);
    assert.equal(parseEventDateText("", 2026), null);
    assert.equal(parseEventDateText(null, 2026), null);
    assert.equal(parseEventDateText("Feb 30, 2026", 2026), null);
    assert.equal(parseEventDateText("13/40/2026", 2026), null);
  });
});

describe("eventDayKey", () => {
  it("prefers starts_at and reports the Eastern day", () => {
    assert.equal(
      eventDayKey({ starts_at: "2026-03-15T00:30:00Z", event_date: "Mar 20, 2026" }, NOW),
      "2026-03-14",
    );
  });
  it("falls back to event_date with the current Eastern year", () => {
    assert.equal(eventDayKey({ starts_at: null, event_date: "Mar 14 · 7 PM" }, NOW), "2026-03-14");
    assert.equal(eventDayKey({ starts_at: null, event_date: "Coming soon" }, NOW), null);
  });
});

describe("isEventToday", () => {
  it("is true for a show tonight in Eastern time even after UTC midnight", () => {
    assert.equal(isEventToday({ starts_at: "2026-03-15T01:00:00Z" }, NOW), true);
    assert.equal(isEventToday({ event_date: "Mar 14, 2026" }, NOW), true);
  });
  it("is false for other days and unparseable dates", () => {
    assert.equal(isEventToday({ event_date: "Mar 15, 2026" }, NOW), false);
    assert.equal(isEventToday({ event_date: "TBA" }, NOW), false);
    assert.equal(isEventToday({}, NOW), false);
  });
  it("counts a multi-day event that spans today", () => {
    assert.equal(
      isEventToday({ starts_at: "2026-03-13T20:00:00Z", ends_at: "2026-03-16T04:00:00Z" }, NOW),
      true,
    );
  });
});
