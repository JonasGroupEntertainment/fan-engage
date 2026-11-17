import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEventRow, EVENT_LIMITS, safeEventLink } from "./build-event-row.ts";

describe("event rows are validated for every writer (BEP #157 port)", () => {
  it("keeps only http and https links", () => {
    assert.equal(safeEventLink("https://tickets.example/x"), "https://tickets.example/x");
    assert.equal(safeEventLink("http://a.example"), "http://a.example/");
    assert.equal(safeEventLink("javascript:alert(1)"), null);
    assert.equal(safeEventLink("data:text/html,hi"), null);
    assert.equal(safeEventLink("tickets.example"), null);
    assert.equal(safeEventLink(""), null);
  });

  it("caps text lengths and capacity", () => {
    const row = buildEventRow({
      title: "t".repeat(500),
      detail: "d".repeat(5000),
      location: "l".repeat(500),
      capacity: 1_000_000,
    });
    assert.equal(row.title.length, EVENT_LIMITS.title);
    assert.equal(row.detail?.length, EVENT_LIMITS.detail);
    assert.equal(row.location?.length, EVENT_LIMITS.location);
    assert.equal(row.capacity, null);
    assert.equal(buildEventRow({ title: "x", capacity: 250 }).capacity, 250);
    assert.equal(buildEventRow({ title: "x", capacity: 2.5 }).capacity, null);
  });
});
