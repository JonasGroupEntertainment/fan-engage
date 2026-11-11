// Pin the zone before any Date is built so "local" means Central here,
// whatever machine runs the suite. node --test gives each file its own
// process, so this does not leak into other tests.
process.env.TZ = "America/Chicago";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isoToLocalInput,
  isValidTimeZone,
  localInputToIso,
  withLocalDateTimesAsIso,
  zonedLocalToIso,
} from "./datetime-local.ts";

describe("localInputToIso", () => {
  it("reads a datetime-local value in the browser's zone, not UTC", () => {
    // Arrange: 7:30 PM Central in March is CDT (UTC-5).
    const typed = "2027-03-14T19:30";

    // Act
    const iso = localInputToIso(typed);

    // Assert
    assert.equal(iso, "2027-03-15T00:30:00.000Z");
  });

  it("uses standard time in winter", () => {
    assert.equal(localInputToIso("2027-01-10T19:30"), "2027-01-11T01:30:00.000Z");
  });

  it("returns an empty string for a blank field", () => {
    assert.equal(localInputToIso(""), "");
    assert.equal(localInputToIso("   "), "");
    assert.equal(localInputToIso(null), "");
    assert.equal(localInputToIso(undefined), "");
  });

  it("leaves a value that already carries a zone unchanged", () => {
    assert.equal(localInputToIso("2027-03-15T00:30:00.000Z"), "2027-03-15T00:30:00.000Z");
    assert.equal(localInputToIso("2027-03-14T19:30:00-05:00"), "2027-03-14T19:30:00-05:00");
  });

  it("passes junk through so the server can reject it", () => {
    assert.equal(localInputToIso("not a date"), "not a date");
  });
});

describe("isoToLocalInput", () => {
  it("shows a stored UTC time as the local wall-clock time", () => {
    assert.equal(isoToLocalInput("2027-03-15T00:30:00+00:00"), "2027-03-14T19:30");
  });

  it("round-trips with localInputToIso", () => {
    const typed = "2026-12-31T23:45";
    assert.equal(isoToLocalInput(localInputToIso(typed)), typed);
  });

  it("returns an empty string for null, blank or invalid input", () => {
    assert.equal(isoToLocalInput(null), "");
    assert.equal(isoToLocalInput(""), "");
    assert.equal(isoToLocalInput("nope"), "");
  });
});

describe("withLocalDateTimesAsIso", () => {
  it("converts only the named fields and keeps the rest", () => {
    // Arrange
    const fd = new FormData();
    fd.set("title", "Opry");
    fd.set("starts_at", "2027-03-14T19:30");
    fd.set("rsvp_opens_at", "");

    // Act
    const out = withLocalDateTimesAsIso(fd, ["starts_at", "rsvp_opens_at"]);

    // Assert
    assert.equal(out.get("title"), "Opry");
    assert.equal(out.get("starts_at"), "2027-03-15T00:30:00.000Z");
    assert.equal(out.get("rsvp_opens_at"), "");
  });

  it("does not change the FormData it was given", () => {
    const fd = new FormData();
    fd.set("starts_at", "2027-03-14T19:30");

    withLocalDateTimesAsIso(fd, ["starts_at"]);

    assert.equal(fd.get("starts_at"), "2027-03-14T19:30");
  });

  it("skips a named field the form does not have", () => {
    const fd = new FormData();
    fd.set("title", "Opry");

    const out = withLocalDateTimesAsIso(fd, ["starts_at"]);

    assert.equal(out.has("starts_at"), false);
  });
});

describe("zonedLocalToIso", () => {
  it("reads a zoneless time in the named zone, not the server's", () => {
    // Arrange: the process is pinned to Central; the caller is in Los Angeles.
    const typed = "2027-03-14T19:30";

    // Act
    const iso = zonedLocalToIso(typed, "America/Los_Angeles");

    // Assert: 7:30 PM PDT is 02:30 UTC the next day.
    assert.equal(iso, "2027-03-15T02:30:00.000Z");
  });

  it("follows daylight saving in the named zone", () => {
    assert.equal(zonedLocalToIso("2027-01-10T19:30", "America/New_York"), "2027-01-11T00:30:00.000Z");
    assert.equal(zonedLocalToIso("2027-07-10T19:30", "America/New_York"), "2027-07-10T23:30:00.000Z");
  });

  it("handles a zone that does not observe daylight saving", () => {
    assert.equal(zonedLocalToIso("2027-07-10T19:30", "America/Phoenix"), "2027-07-11T02:30:00.000Z");
  });

  it("returns null for a value that is not a zoneless date and time", () => {
    assert.equal(zonedLocalToIso("", "America/Chicago"), null);
    assert.equal(zonedLocalToIso("2027-03-14", "America/Chicago"), null);
    assert.equal(zonedLocalToIso("2027-03-14T19:30:00Z", "America/Chicago"), null);
    assert.equal(zonedLocalToIso("2027-13-40T19:30", "America/Chicago"), null);
  });

  it("returns null for an unknown zone", () => {
    assert.equal(zonedLocalToIso("2027-03-14T19:30", "Mars/Olympus"), null);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects anything else", () => {
    assert.equal(isValidTimeZone("America/Chicago"), true);
    assert.equal(isValidTimeZone("Mars/Olympus"), false);
    assert.equal(isValidTimeZone(""), false);
    assert.equal(isValidTimeZone(null), false);
  });
});
