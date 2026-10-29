import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTourList } from "./parse-tour-list.ts";
import { parseEventDateText } from "../today/event-day.ts";
import { buildStartsAt, formatEventDisplayDate, buildEventRow, resolveEventGeo } from "./build-event-row.ts";

// 2026-01-10 — early in the year so year-less dates after it stay in 2026
// and dates before it roll to 2027.
const NOW = new Date("2026-01-10T12:00:00Z");

function one(line: string) {
  const r = parseTourList(line, NOW);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.rows.length, 1);
  return r.rows[0];
}

describe("parseTourList — line shapes", () => {
  it("em-dash separated with a URL", () => {
    const r = one("Mar 14, 2026 — Ryman Auditorium — Nashville, TN — https://tix.example/ryman");
    assert.equal(r.date, "2026-03-14");
    assert.equal(r.venue, "Ryman Auditorium");
    assert.equal(r.city, "Nashville");
    assert.equal(r.region, "TN");
    assert.equal(r.location, "Nashville, TN");
    assert.equal(r.url, "https://tix.example/ryman");
    assert.equal(r.time, null);
  });

  it("pipe separated with a two-digit year", () => {
    const r = one("3/14/26 | Ryman Auditorium | Nashville, TN");
    assert.equal(r.date, "2026-03-14");
    assert.equal(r.venue, "Ryman Auditorium");
    assert.equal(r.location, "Nashville, TN");
  });

  it("no separators: 'March 14 2026 Ryman Auditorium, Nashville TN'", () => {
    const r = one("March 14 2026 Ryman Auditorium, Nashville TN");
    assert.equal(r.date, "2026-03-14");
    assert.equal(r.venue, "Ryman Auditorium");
    assert.equal(r.city, "Nashville");
    assert.equal(r.region, "TN");
  });

  it("tab separated with a time", () => {
    const r = one("2026-03-15\tThe Fillmore\tDetroit, MI\t7:30 PM");
    assert.equal(r.date, "2026-03-15");
    assert.equal(r.time, "19:30");
    assert.equal(r.venue, "The Fillmore");
    assert.equal(r.location, "Detroit, MI");
  });

  it("middle-dot separated with a weekday prefix", () => {
    const r = one("Sat Mar 16 · 7:30 PM · Red Rocks Amphitheatre · Morrison, CO");
    assert.equal(r.date, "2026-03-16");
    assert.equal(r.time, "19:30");
    assert.equal(r.venue, "Red Rocks Amphitheatre");
    assert.equal(r.location, "Morrison, CO");
  });

  it("date at the end, comma-only line", () => {
    const r = one("Ryman Auditorium, Nashville, TN — Mar 17");
    assert.equal(r.date, "2026-03-17");
    assert.equal(r.venue, "Ryman Auditorium");
    assert.equal(r.location, "Nashville, TN");
  });

  it("venue and city run together without a comma, '8pm', bare www URL", () => {
    const r = one("Mar 18 Moody Theater Austin TX 8pm www.tix.com/x");
    assert.equal(r.venue, "Moody Theater");
    assert.equal(r.city, "Austin");
    assert.equal(r.region, "TX");
    assert.equal(r.time, "20:00");
    assert.equal(r.url, "https://www.tix.com/x");
  });

  it("spaced hyphen separators, full state name, trailing note → detail", () => {
    const r = one("Apr 2 - Grand Ole Opry - Nashville, Tennessee - Members only");
    assert.equal(r.venue, "Grand Ole Opry");
    assert.equal(r.location, "Nashville, TN");
    assert.equal(r.detail, "Members only");
  });

  it("'Doors 7:00 PM' prefix is swallowed with the time", () => {
    const r = one("Doors 7:00 PM 2026-05-05 The Anthem Washington, DC");
    assert.equal(r.time, "19:00");
    assert.equal(r.venue, "The Anthem");
    assert.equal(r.location, "Washington, DC");
  });

  it("24h time", () => {
    const r = one("2026-05-05 | The Anthem | Washington, DC | 19:00");
    assert.equal(r.time, "19:00");
  });

  it("'14 March 2026' day-first dates", () => {
    const r = one("14 March 2026 — Fox Theatre — Atlanta, GA");
    assert.equal(r.date, "2026-03-14");
    assert.equal(r.venue, "Fox Theatre");
  });

  it("ordinal day 'Mar. 14th'", () => {
    const r = one("Mar. 14th — Fox Theatre — Atlanta, GA");
    assert.equal(r.date, "2026-03-14");
  });

  it("12 AM / 12 PM edge cases", () => {
    assert.equal(one("Mar 14 | Venue | Austin, TX | 12 PM").time, "12:00");
    assert.equal(one("Mar 14 | Venue | Austin, TX | 12:30 AM").time, "00:30");
  });

  it("URL anywhere on the line, trailing punctuation trimmed", () => {
    const r = one("https://tix.example/a, Mar 14 — Venue — Austin, TX.");
    assert.equal(r.url, "https://tix.example/a");
    assert.equal(r.venue, "Venue");
  });
});

describe("parseTourList — places", () => {
  it("resolves coordinates for a known city/state", () => {
    const r = one("Mar 14 | Ryman Auditorium | Nashville, TN");
    assert.ok(typeof r.lat === "number" && typeof r.lng === "number");
  });

  it("leaves lat/lng null for an unknown city", () => {
    const r = one("Mar 14 | Some Barn | Nowheresville, TN");
    assert.equal(r.city, "Nowheresville");
    assert.equal(r.region, "TN");
    assert.equal(r.lat, null);
    assert.equal(r.lng, null);
  });

  it("no city/state at all → venue only, location null", () => {
    const r = one("Jun 1 2026 — Hollywood Bowl");
    assert.equal(r.venue, "Hollywood Bowl");
    assert.equal(r.location, null);
    assert.equal(r.city, null);
  });

  it("non-US place is kept as detail, not a region", () => {
    const r = one("14 March 2026 — O2 Arena — London");
    assert.equal(r.venue, "O2 Arena");
    assert.equal(r.region, null);
    assert.equal(r.detail, "London");
  });

  it("a lower-case two-letter word is not a state ('Fillmore in Detroit')", () => {
    const r = one("Mar 14 — The Fillmore in Detroit");
    assert.equal(r.venue, "The Fillmore in Detroit");
    assert.equal(r.region, null);
  });

  it("'City, ST' can precede a trailing note", () => {
    const r = one("Mar 14 — Venue — Austin, TX — w/ Dan Marshall");
    assert.equal(r.location, "Austin, TX");
    assert.equal(r.detail, "w/ Dan Marshall");
  });
});

describe("parseTourList — years", () => {
  it("year-less dates still ahead use the current Eastern year", () => {
    assert.equal(one("Dec 31 | MSG | New York, NY").date, "2026-12-31");
  });
  it("year-less dates already passed roll to next year", () => {
    assert.equal(one("Jan 5 | Fox Theatre | Atlanta, GA").date, "2027-01-05");
  });
  it("today counts as upcoming, not past", () => {
    assert.equal(parseTourList("Jan 10 | Venue | Austin, TX", NOW).rows[0].date, "2026-01-10");
  });
  it("explicit year is never overridden", () => {
    assert.equal(one("Jan 5, 2025 | Fox Theatre | Atlanta, GA").date, "2025-01-05");
  });
});

describe("parseTourList — junk, errors, duplicates", () => {
  it("skips blank and comment lines", () => {
    const r = parseTourList("\n\n# tour 2026\nMar 14 | Venue | Austin, TX\n\n", NOW);
    assert.equal(r.rows.length, 1);
    assert.equal(r.errors.length, 0);
    assert.equal(r.rows[0].line, 4);
  });

  it("reports lines without a date", () => {
    const r = parseTourList("Coming soon — Secret show", NOW);
    assert.equal(r.rows.length, 0);
    assert.deepEqual(r.errors.map((e) => e.reason), ["No date found"]);
  });

  it("reports lines without a venue", () => {
    const r = parseTourList("Mar 14, 2026", NOW);
    assert.equal(r.rows.length, 0);
    assert.equal(r.errors[0].reason, "No venue found");
  });

  it("reports impossible dates", () => {
    const r = parseTourList("Feb 30, 2026 | Nowhere | Austin, TX", NOW);
    assert.equal(r.rows.length, 0);
    assert.match(r.errors[0].reason, /Invalid date/);
  });

  it("does not read a bare '3/14' or a time as a date", () => {
    assert.equal(parseTourList("3/14 | Venue | Austin, TX", NOW).errors.length, 1);
    assert.equal(parseTourList("7:30 PM | Venue | Austin, TX", NOW).errors.length, 1);
  });

  it("drops duplicates of (venue, date) across different shapes, case-insensitively", () => {
    const r = parseTourList(
      [
        "Mar 14, 2026 — Ryman Auditorium — Nashville, TN",
        "3/14/26 | ryman auditorium | Nashville, TN",
        "Mar 15, 2026 — Ryman Auditorium — Nashville, TN",
      ].join("\n"),
      NOW,
    );
    assert.equal(r.rows.length, 2);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].line, 2);
    assert.match(r.errors[0].reason, /Duplicate of line 1/);
  });

  it("keeps going after a bad line and preserves line numbers", () => {
    const r = parseTourList("Mar 14 | A | Austin, TX\nTBA\nMar 15 | B | Austin, TX", NOW);
    assert.deepEqual(r.rows.map((x) => x.line), [1, 3]);
    assert.deepEqual(r.errors.map((x) => x.line), [2]);
  });

  it("handles Windows line endings and an empty paste", () => {
    assert.equal(parseTourList("Mar 14 | A | Austin, TX\r\nMar 15 | B | Austin, TX\r\n", NOW).rows.length, 2);
    assert.deepEqual(parseTourList("", NOW), { rows: [], errors: [] });
  });
});

describe("build-event-row helpers", () => {
  it("formats the display date the way the admin placeholder does, and it round-trips", () => {
    assert.equal(formatEventDisplayDate("2026-03-14"), "Mar 14, 2026");
    assert.equal(formatEventDisplayDate("2026-03-14", "19:30"), "Mar 14, 2026 · 7:30 PM");
    assert.equal(formatEventDisplayDate("2026-03-14", "20:00"), "Mar 14, 2026 · 8 PM");
    assert.equal(formatEventDisplayDate("2026-03-14", "00:30"), "Mar 14, 2026 · 12:30 AM");
    assert.equal(parseEventDateText(formatEventDisplayDate("2026-03-14", "19:30"), 2026), "2026-03-14");
  });

  it("builds starts_at only when a time is known, in datetime-local shape", () => {
    assert.equal(buildStartsAt("2026-03-14", "19:30"), "2026-03-14T19:30");
    assert.equal(buildStartsAt("2026-03-14", null), null);
    assert.equal(buildStartsAt("bad", "19:30"), null);
  });

  it("buildEventRow nulls blanks and defaults sort_order", () => {
    assert.deepEqual(buildEventRow({ title: " Ryman ", eventDate: "", url: " " }), {
      title: "Ryman",
      detail: null,
      event_date: null,
      starts_at: null,
      location: null,
      url: null,
      capacity: null,
      sort_order: 0,
    });
    assert.equal(buildEventRow({ title: "x", capacity: Number.NaN, sortOrder: 3 }).sort_order, 3);
  });

  it("resolveEventGeo resolves from the city table when lat/lng are blank", () => {
    const g = resolveEventGeo({ city: "Nashville", region: "tn", lat: "", lng: "" });
    assert.equal(g.region, "TN");
    assert.ok(typeof g.lat === "number");
    assert.deepEqual(resolveEventGeo({ city: "", region: "" }), { city: null, region: null, lat: null, lng: null });
    assert.deepEqual(resolveEventGeo({ city: "Austin", region: "TX", lat: "1", lng: "2" }).lat, 1);
  });
});
