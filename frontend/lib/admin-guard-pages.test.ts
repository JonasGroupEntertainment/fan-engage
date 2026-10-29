import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Source-level checks for admin route gating (Sprint 1, track B). The
 * decision logic itself is unit-tested in admin-authz.test.ts; these
 * tests pin which routes call which guard so a refactor can't silently
 * drop a gate.
 */
function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("admin-guard superAdminOnly", () => {
  it("exists, redirects on signed-out, and delegates to authorizeAdmin", () => {
    const src = readRepo("./admin-guard.ts");
    assert.match(src, /export async function superAdminOnly\(/);
    assert.match(src, /authorizeAdmin\(\{ superAdminOnly: true \}\)/);
    assert.match(src, /redirect\(`\/login\?next=/);
    assert.match(src, /redirect\("\/admin"\)/);
  });
});

describe("super-admin-only admin routes", () => {
  for (const file of [
    "../app/admin/network/page.tsx",
    "../app/admin/fraud-signals/page.tsx",
    "../app/admin/briefs/page.tsx",
  ]) {
    it(`${file} calls superAdminOnly`, () => {
      const src = readRepo(file);
      assert.match(src, /import \{ superAdminOnly \} from "@\/lib\/admin-guard"/);
      assert.match(src, /await superAdminOnly\(/);
    });
  }

  it("network live-feed action requires super-admin too", () => {
    const src = readRepo("../app/admin/network/actions.ts");
    assert.match(src, /authorizeAdmin\(\{ superAdminOnly: true \}\)/);
    assert.doesNotMatch(src, /getAdminUser/);
  });
});

describe("moderation queue scoping", () => {
  it("filters posts and comments to the current community unless super-admin", () => {
    const src = readRepo("../app/admin/moderation/page.tsx");
    assert.match(src, /adminContext\.isSuperAdmin\s*\?\s*null\s*:\s*adminContext\.currentCommunityId/);
    assert.match(src, /postsQuery\.eq\("artist_slug", scopeCommunityId\)/);
    assert.match(src, /commentsQuery\.eq\("community_posts\.artist_slug", scopeCommunityId\)/);
  });

  it("actions authorize against the row's own community", () => {
    const src = readRepo("../app/admin/moderation/actions.ts");
    assert.match(src, /communityOfRow\(table, rowId\)/);
    assert.match(src, /authorizeAdmin\(\{ communityId, minRole: "editor" \}\)/);
  });
});

describe("broadcast", () => {
  it("page has no hardcoded artist slug", () => {
    const src = readRepo("../app/admin/broadcast/page.tsx");
    assert.doesNotMatch(src, /raelynn/i);
    assert.doesNotMatch(src, /name="artist_slug"/);
    assert.match(src, /getBroadcastTarget/);
  });

  it("sendBroadcast targets the admin context community with minimum role admin", () => {
    const src = readRepo("../app/admin/broadcast/actions.ts");
    assert.match(src, /const artistSlug = ctx\.currentCommunityId \?\? ""/);
    assert.doesNotMatch(src, /formData\.get\("artist_slug"\)/);
    assert.match(src, /authorizeAdmin\(\{ communityId: artistSlug, minRole: "admin" \}, ctx\)/);
  });
});

describe("honest data", () => {
  it("stripe connect page no longer renders a pseudo-random sparkline", () => {
    const src = readRepo("../app/admin/stripe/connect/page.tsx");
    assert.doesNotMatch(src, /Sparkline/);
    assert.doesNotMatch(src, /Math\.sin/);
    assert.doesNotMatch(src, /plausible/);
    assert.doesNotMatch(src, /illustrative/);
    assert.match(src, /No data yet/);
  });

  it("for-artists page makes no ownership claims PRODUCT.md forbids", () => {
    const src = readRepo("../app/for-artists/page.tsx");
    assert.doesNotMatch(src, /label can't take from you/);
    assert.doesNotMatch(src, /stay yours/);
  });
});
