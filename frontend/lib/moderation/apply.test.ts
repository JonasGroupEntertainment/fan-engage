import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  OVERRIDE_ACTION_STATUS,
  compareQueueRows,
  countQueue,
  decideOverride,
  parseOverrideForm,
} from "./apply.ts";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function form(fields: Record<string, string>) {
  return { get: (name: string) => fields[name] ?? null };
}

describe("parseOverrideForm", () => {
  it("accepts both moderated tables and trims notes", () => {
    assert.deepEqual(
      parseOverrideForm(form({ table: "community_posts", row_id: "p1", notes: "  ok " })),
      { table: "community_posts", rowId: "p1", notes: "ok" },
    );
    assert.deepEqual(
      parseOverrideForm(form({ table: "community_comments", row_id: "c1" })),
      { table: "community_comments", rowId: "c1", notes: undefined },
    );
  });

  it("rejects unknown tables and missing row ids", () => {
    assert.equal(parseOverrideForm(form({ table: "fans", row_id: "x" })), null);
    assert.equal(parseOverrideForm(form({ table: "community_posts", row_id: "  " })), null);
    assert.equal(parseOverrideForm(form({})), null);
  });
});

describe("decideOverride", () => {
  it("allows a row inside the caller's community", () => {
    assert.deepEqual(
      decideOverride({ rowCommunityId: "raelynn", scopeCommunityId: "raelynn", newStatus: "safe" }),
      { ok: true, communityId: "raelynn" },
    );
  });

  it("refuses a row from another community even with a valid status", () => {
    assert.deepEqual(
      decideOverride({ rowCommunityId: "other", scopeCommunityId: "raelynn", newStatus: "auto_hide" }),
      { ok: false, reason: "out_of_scope" },
    );
  });

  it("super-admin scope (null) may act on any community", () => {
    assert.equal(
      decideOverride({ rowCommunityId: "other", scopeCommunityId: null, newStatus: "flag_review" }).ok,
      true,
    );
  });

  it("refuses missing rows and unknown statuses", () => {
    assert.deepEqual(
      decideOverride({ rowCommunityId: null, scopeCommunityId: "raelynn", newStatus: "safe" }),
      { ok: false, reason: "row_not_found" },
    );
    assert.deepEqual(
      decideOverride({ rowCommunityId: "raelynn", scopeCommunityId: "raelynn", newStatus: "deleted" }),
      { ok: false, reason: "invalid_status" },
    );
  });

  it("button map only ever yields the three override statuses", () => {
    assert.deepEqual(Object.values(OVERRIDE_ACTION_STATUS).sort(), [
      "auto_hide",
      "flag_review",
      "safe",
    ]);
  });
});

describe("queue ordering", () => {
  const rows = [
    { id: "a", status: "flag_review", self_harm: false, classified_at: "2026-10-01T00:00:00Z", created_at: "2026-09-30T00:00:00Z" },
    { id: "b", status: "pending", self_harm: false, classified_at: null, created_at: "2026-10-05T00:00:00Z" },
    { id: "c", status: "auto_hide", self_harm: false, classified_at: "2026-09-01T00:00:00Z", created_at: "2026-08-30T00:00:00Z" },
    { id: "d", status: "flag_review", self_harm: true, classified_at: "2026-08-01T00:00:00Z", created_at: "2026-07-30T00:00:00Z" },
    { id: "e", status: "flag_review", self_harm: false, classified_at: "2026-10-02T00:00:00Z", created_at: "2026-10-01T00:00:00Z" },
  ];

  it("self-harm first, then auto_hide, flag_review, pending; newest within a bucket", () => {
    const order = [...rows].sort(compareQueueRows).map((r) => r.id);
    assert.deepEqual(order, ["d", "c", "e", "a", "b"]);
  });

  it("counts every bucket", () => {
    assert.deepEqual(countQueue(rows), {
      total: 5,
      pending: 1,
      flag_review: 3,
      auto_hide: 1,
      self_harm: 1,
    });
  });
});

describe("moderation action files share the module", () => {
  it("admin and portal actions both parse and decide through lib/moderation/apply", () => {
    for (const rel of [
      "../../app/admin/moderation/actions.ts",
      "../../app/artist-portal/moderation/actions.ts",
    ]) {
      const src = readRepo(rel);
      assert.match(src, /@\/lib\/moderation\/apply/, rel);
      assert.match(src, /parseOverrideForm\(/, rel);
      assert.match(src, /decideOverride\(/, rel);
      assert.match(src, /applyAdminOverride\(/, rel);
    }
  });

  it("portal actions are gated by the portal role matrix and scoped to the caller's community", () => {
    const src = readRepo("../../app/artist-portal/moderation/actions.ts");
    assert.match(src, /assertPortalRole\("moderation"\)/);
    assert.match(src, /scopeCommunityId:\s*ctx\.communityId/);
    assert.match(src, /communityOfRow\(/);
    assert.doesNotMatch(src, /@\/lib\/admin-guard/);
  });

  it("portal page keeps the self-harm handling the admin page has", () => {
    const admin = readRepo("../../app/admin/moderation/page.tsx");
    const portal = readRepo("../../app/artist-portal/moderation/page.tsx");
    assert.match(portal, /requirePortalPage\("moderation"/);
    assert.match(portal, /\.eq\("artist_slug", ctx\.communityId\)/);
    assert.match(portal, /\.eq\("community_posts\.artist_slug", ctx\.communityId\)/);
    for (const re of [
      /Self-harm signal/,
      /this stays visible/,
      /surface crisis resources/,
    ]) {
      assert.match(admin, re);
      assert.match(portal, re);
    }
  });
});
