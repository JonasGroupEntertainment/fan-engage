import { test } from "node:test";
import assert from "node:assert/strict";
import { countByDay, groupAppErrors } from "./app-error-summary.ts";

const rows = [
  { created_at: "2026-11-26T10:00:00Z", source: "server" as const, message: "boom", path: "/a", route_path: "/artists/[slug]", digest: "1" },
  { created_at: "2026-11-26T12:00:00Z", source: "server" as const, message: "boom", path: "/b", route_path: "/artists/[slug]", digest: "2" },
  { created_at: "2026-11-25T09:00:00Z", source: "client" as const, message: "oops", path: "/me", route_path: null, digest: null },
];

test("groups the same message in the same route, newest first", () => {
  const groups = groupAppErrors(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].where, "/artists/[slug]");
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].firstSeen, "2026-11-26T10:00:00Z");
  assert.equal(groups[0].lastSeen, "2026-11-26T12:00:00Z");
  assert.equal(groups[0].lastDigest, "2");
  assert.equal(groups[1].where, "/me");
});

test("counts rows per day, oldest first", () => {
  assert.deepEqual(countByDay(rows), [
    { day: "2026-11-25", count: 1 },
    { day: "2026-11-26", count: 2 },
  ]);
  assert.deepEqual(countByDay([]), []);
});
