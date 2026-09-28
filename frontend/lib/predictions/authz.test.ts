import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canResolvePrediction } from "./authz.ts";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const base = {
  isSuperAdmin: false,
  communities: ["raelynn"],
  currentCommunityId: "raelynn",
  role: "owner" as const,
};

describe("canResolvePrediction", () => {
  it("allows an owner or admin working in the prediction's community", () => {
    assert.equal(canResolvePrediction(base, "raelynn"), true);
    assert.equal(canResolvePrediction({ ...base, role: "admin" }, "raelynn"), true);
  });

  it("refuses editors, viewers and missing roles", () => {
    assert.equal(canResolvePrediction({ ...base, role: "editor" }, "raelynn"), false);
    assert.equal(canResolvePrediction({ ...base, role: "viewer" }, "raelynn"), false);
    assert.equal(canResolvePrediction({ ...base, role: null }, "raelynn"), false);
  });

  it("refuses an admin of a different community", () => {
    assert.equal(canResolvePrediction(base, "danger-twins"), false);
  });

  it("refuses when the current community is not the prediction's", () => {
    const multi = { ...base, communities: ["raelynn", "danger-twins"] };
    assert.equal(canResolvePrediction(multi, "danger-twins"), false);
  });

  it("refuses a signed-out caller or a post with no community", () => {
    assert.equal(canResolvePrediction(null, "raelynn"), false);
    assert.equal(canResolvePrediction(base, null), false);
  });

  it("lets a super-admin resolve anywhere", () => {
    const sa = { ...base, isSuperAdmin: true, communities: [], currentCommunityId: null, role: "owner" as const };
    assert.equal(canResolvePrediction(sa, "danger-twins"), true);
  });
});

describe("resolvePrediction guards", () => {
  const resolveTs = readRepo("./resolve.ts");
  const adminAction = readRepo("../../app/admin/artists/[slug]/predictions/actions.ts");
  const fanAction = readRepo("../../app/artists/[slug]/community/predictions-actions.ts");

  it("checks the admin against the DB artist_slug, not the form", () => {
    assert.match(resolveTs, /canResolvePrediction\(opts\.ctx, post\.artist_slug/);
  });

  it("checks the option belongs to the prediction", () => {
    assert.match(resolveTs, /from\("community_poll_options"\)[\s\S]*?\.eq\("post_id", opts\.postId\)/);
  });

  it("stamps resolution only while unresolved and locks the answer", () => {
    assert.match(resolveTs, /\.is\("resolved_at", null\)/);
    assert.match(resolveTs, /already resolved with a different answer/);
  });

  it("both callers load the admin context and pass it through", () => {
    for (const src of [adminAction, fanAction]) {
      assert.match(src, /getAdminContext\(\)/);
      assert.match(src, /resolvePrediction\(\{[\s\S]*?ctx/);
    }
  });
});
