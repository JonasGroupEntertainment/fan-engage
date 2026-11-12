import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DUPLICATE_EVENT_WINDOW_MS, duplicateEventWindowStart, parseCapacity } from "./duplicate-guard.ts";

function readApp(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}

describe("admin events tab", () => {
  it("duplicate window starts 60 seconds before now", () => {
    const now = new Date("2026-11-10T18:12:38.100Z");
    assert.equal(duplicateEventWindowStart(now), "2026-11-10T18:11:38.100Z");
    assert.equal(DUPLICATE_EVENT_WINDOW_MS, 60_000);
  });

  it("parses capacity as a positive whole number or null", () => {
    assert.equal(parseCapacity("50"), 50);
    assert.equal(parseCapacity(" 12 "), 12);
    assert.equal(parseCapacity(""), null);
    assert.equal(parseCapacity("0"), null);
    assert.equal(parseCapacity("-3"), null);
    assert.equal(parseCapacity("2.5"), null);
    assert.equal(parseCapacity("abc"), null);
  });

  it("addEventAction checks for a recent duplicate before inserting", () => {
    const src = readApp("admin/events/actions.ts");
    const check = src.indexOf("duplicateEventWindowStart(");
    const insert = src.indexOf('.from("artist_events").insert(');
    assert.ok(check > -1, "duplicate check missing");
    assert.ok(insert > check, "duplicate check must run before the insert");
  });

  it("actions and page are scoped to the admin's own artist", () => {
    const actions = readApp("admin/events/actions.ts");
    assert.match(actions, /getAdminCommunityId\(\)/);
    assert.match(actions, /authorizeAdmin\(/);
    assert.match(actions, /\.delete\(\)\s*\.eq\("id", id\)\s*\.eq\("artist_slug", artistSlug\)/);
    const page = readApp("admin/events/page.tsx");
    assert.match(page, /authorizeAdmin\(/);
    assert.match(page, /\.eq\("artist_slug", artistSlug\)/);
  });

  it("form uses the pending submit button", () => {
    assert.match(readApp("admin/events/page.tsx"), /<PendingSubmitButton[\s\S]*?Add event/);
  });

  it("admin nav has an Events tab", () => {
    assert.match(readApp("admin/layout.tsx"), /href: "\/admin\/events", label: "Events"/);
  });
});
