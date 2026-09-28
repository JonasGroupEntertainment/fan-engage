import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canAdminCommunity,
  decideAdminAccess,
  roleAtLeast,
  type AdminAuthzContext,
} from "./admin-authz.ts";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const admin: AdminAuthzContext = {
  isSuperAdmin: false,
  communities: ["raelynn"],
  currentCommunityId: "raelynn",
  role: "admin",
};
const superAdmin: AdminAuthzContext = {
  isSuperAdmin: true,
  communities: [],
  currentCommunityId: "raelynn",
  role: "owner",
};

describe("roleAtLeast", () => {
  it("ranks viewer < editor < admin < owner", () => {
    assert.equal(roleAtLeast("owner", "admin"), true);
    assert.equal(roleAtLeast("admin", "admin"), true);
    assert.equal(roleAtLeast("editor", "admin"), false);
    assert.equal(roleAtLeast("editor", "editor"), true);
    assert.equal(roleAtLeast("viewer", "editor"), false);
    assert.equal(roleAtLeast(null, "viewer"), false);
  });
});

describe("canAdminCommunity", () => {
  it("allows an admin in their own current community", () => {
    assert.equal(canAdminCommunity(admin, "raelynn"), true);
  });

  it("refuses an admin acting on another community", () => {
    assert.equal(canAdminCommunity(admin, "danger-twins"), false);
  });

  it("refuses a multi-community admin whose current community is different", () => {
    const multi = { ...admin, communities: ["raelynn", "danger-twins"] };
    assert.equal(canAdminCommunity(multi, "danger-twins"), false);
    assert.equal(
      canAdminCommunity({ ...multi, currentCommunityId: "danger-twins" }, "danger-twins"),
      true,
    );
  });

  it("refuses a current community the admin holds no grant for", () => {
    assert.equal(canAdminCommunity({ ...admin, currentCommunityId: "x", communities: [] }, "x"), false);
  });

  it("applies the minimum role", () => {
    const editor = { ...admin, role: "editor" as const };
    assert.equal(canAdminCommunity(editor, "raelynn"), false);
    assert.equal(canAdminCommunity(editor, "raelynn", "editor"), true);
    assert.equal(canAdminCommunity({ ...admin, role: "viewer" }, "raelynn", "editor"), false);
  });

  it("lets a super-admin act anywhere", () => {
    assert.equal(canAdminCommunity(superAdmin, "danger-twins"), true);
  });

  it("refuses a missing context or community", () => {
    assert.equal(canAdminCommunity(null, "raelynn"), false);
    assert.equal(canAdminCommunity(admin, ""), false);
    assert.equal(canAdminCommunity(admin, null), false);
  });
});

describe("decideAdminAccess", () => {
  it("reports signed_out when there is no admin context", () => {
    assert.deepEqual(decideAdminAccess(null, { communityId: "raelynn" }), {
      ok: false,
      reason: "signed_out",
    });
  });

  it("keeps super-admin-only actions to super-admins", () => {
    assert.deepEqual(decideAdminAccess(admin, { superAdminOnly: true }), {
      ok: false,
      reason: "forbidden",
    });
    assert.deepEqual(decideAdminAccess(superAdmin, { superAdminOnly: true }), { ok: true });
  });

  it("defaults to the admin role", () => {
    const editor = { ...admin, role: "editor" as const };
    assert.equal(decideAdminAccess(editor, { communityId: "raelynn" }).ok, false);
    assert.equal(decideAdminAccess(admin, { communityId: "raelynn" }).ok, true);
  });

  it("refuses a community-scoped action with no community", () => {
    assert.equal(decideAdminAccess(admin, {}).ok, false);
  });
});

// Source checks: each admin write path goes through the shared guard and
// no longer relies on the unscoped getAdminUser check.
const GUARDED_FILES = [
  "../app/api/admin/stripe-coupon/route.ts",
  "../app/api/admin/import-fans/route.ts",
  "../app/api/admin/influencers/route.ts",
  "../app/api/admin/influencers/[id]/promo-codes/route.ts",
  "../app/admin/fans/import/actions.ts",
  "../app/admin/rewards/actions.ts",
  "../app/account/promo/actions.ts",
  "../app/admin/[slug]/setup/setup-actions.ts",
  "../app/admin/applications/review-actions.ts",
  "../app/admin/artists/actions.ts",
  "../app/admin/artists/[slug]/events/[id]/match/actions.ts",
  "../app/admin/policies/actions.ts",
  "../app/admin/campaigns/actions.ts",
  "../app/admin/challenges/actions.ts",
  "../app/admin/fraud-signals/actions.ts",
  "../app/admin/offers/actions.ts",
  "../app/admin/community/actions.ts",
  "../app/admin/influencers/actions.ts",
  "../app/admin/moderation/actions.ts",
  "../app/admin/post-drafts/actions.ts",
  "../app/admin/segments/actions.ts",
  "../app/artists/[slug]/community/actions.ts",
  "../app/artists/[slug]/community/predictions-actions.ts",
];

describe("admin write paths use the shared guard", () => {
  for (const rel of GUARDED_FILES) {
    it(`${rel} calls the guard and not getAdminUser`, () => {
      const src = readRepo(rel);
      assert.match(src, /@\/lib\/admin-guard/);
      assert.match(src, /\b(authorizeAdmin|assertAdmin|communityAdminUser)\(/);
      assert.doesNotMatch(src, /\bgetAdminUser\b/);
    });
  }

  it("coupons and universal promo codes are super-admin only", () => {
    assert.match(readRepo("../app/api/admin/stripe-coupon/route.ts"), /superAdminOnly:\s*true/);
    assert.match(readRepo("../app/account/promo/actions.ts"), /superAdminOnly:\s*true/);
  });

  it("suspending a fan is super-admin only", () => {
    const src = readRepo("../app/admin/community/actions.ts");
    const body = src.slice(src.indexOf("adminSuspendFanAction"));
    assert.match(body, /assertAdmin\(\{\s*superAdminOnly:\s*true\s*\}\)/);
  });

  it("by-id moderation loads the owning community from the database", () => {
    assert.match(readRepo("../app/admin/community/actions.ts"), /communityOfRow\(/);
    assert.match(readRepo("../app/admin/moderation/actions.ts"), /communityOfRow\(/);
  });

  it("fan import requires a target community", () => {
    const src = readRepo("../app/api/admin/import-fans/route.ts");
    assert.match(src, /Choose a community to import into\./);
  });
});

describe("onboarding wizard redirects", () => {
  it("passes next and returnTo through safeAppPath", () => {
    const src = readRepo("../app/onboarding/onboarding-wizard.tsx");
    assert.match(src, /import \{ safeAppPath \} from "@\/lib\/safe-app-path"/);
    assert.match(src, /safeAppPath\(rawNext\)/);
    assert.match(src, /safeAppPath\(rawReturn\)/);
  });
});
