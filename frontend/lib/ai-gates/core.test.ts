import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FEATURES, envFallbackFor, isAiFeatureKey, resolveAiGate } from "./core.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const ENV_ON = { AI_DRAFTER_FREE_COMMUNITIES: "raelynn, other" };
const ENV_STAR = { AI_DRAFTER_FREE_COMMUNITIES: "*" };
const ENV_OFF = { AI_DRAFTER_FREE_COMMUNITIES: "" };
const ENV_UNSET: Record<string, string | undefined> = {};

describe("resolveAiGate — row > env > off", () => {
  it("off when there is no row and no env", () => {
    const r = resolveAiGate("ai_comment_drafter", "raelynn", null, ENV_UNSET);
    assert.deepEqual(r, { enabled: false, source: "off", envEnabled: false });
  });

  it("env opens the drafter when no row exists (slug list and *)", () => {
    assert.deepEqual(resolveAiGate("ai_comment_drafter", "raelynn", null, ENV_ON), {
      enabled: true,
      source: "env",
      envEnabled: true,
    });
    assert.equal(resolveAiGate("ai_comment_drafter", "someone", null, ENV_STAR).source, "env");
    assert.equal(resolveAiGate("ai_comment_drafter", "someone", null, ENV_ON).source, "off");
  });

  it("a row wins over env in both directions", () => {
    // env says on, row says off → off
    const off = resolveAiGate("ai_comment_drafter", "raelynn", false, ENV_ON);
    assert.equal(off.enabled, false);
    assert.equal(off.source, "row");
    assert.equal(off.envEnabled, true, "the greyed env value is still reported");
    // env says off, row says on → on
    const on = resolveAiGate("ai_comment_drafter", "raelynn", true, ENV_OFF);
    assert.equal(on.enabled, true);
    assert.equal(on.source, "row");
  });

  it("features without an env fallback are off unless a row enables them", () => {
    assert.equal(envFallbackFor("ai_post_drafts", "raelynn", ENV_STAR), false);
    assert.equal(resolveAiGate("ai_copilot", "raelynn", null, ENV_STAR).source, "off");
    assert.equal(resolveAiGate("ai_copilot", "raelynn", true, ENV_UNSET).enabled, true);
  });

  it("only the drafter is wired; the rest are display-only", () => {
    const wired = AI_FEATURES.filter((f) => f.wired).map((f) => f.key);
    assert.deepEqual(wired, ["ai_comment_drafter"]);
    assert.equal(isAiFeatureKey("ai_comment_drafter"), true);
    assert.equal(isAiFeatureKey("ai_anything"), false);
  });
});

describe("the gate is wired where it matters", () => {
  it("draft-comment route and the entitlements helper read the DB gate", () => {
    const route = readRepo("../../app/api/ai/draft-comment/route.ts");
    assert.match(route, /requireAiCommentDrafter\(user\.id, communityId\)/);
    const ent = readRepo("../entitlements.ts");
    assert.match(ent, /isFeatureEnabledForCommunity\("ai_comment_drafter", communityId\)/);
    assert.match(ent, /requirePremiumFeature\(fanId, communityId, "ai_comment_drafter"\)/);
  });

  it("0091 creates ai_feature_gates with the (feature, community_id) pk and super-admin RLS", () => {
    const sql = readRepo("../../../supabase/migrations/0091_presave_and_ai_gates.sql");
    assert.match(sql, /create table if not exists public\.ai_feature_gates/);
    assert.match(sql, /primary key \(feature, community_id\)/);
    assert.match(sql, /au\.community_id = '\*'/);
    assert.match(sql, /grant all on table public\.ai_feature_gates to service_role/);
  });

  it("/admin/ai-gates is super-admin only", () => {
    const page = readRepo("../../app/admin/ai-gates/page.tsx");
    assert.match(page, /superAdminOnly\(/);
    const actions = readRepo("../../app/admin/ai-gates/actions.ts");
    assert.match(actions, /superAdminOnly: true/);
  });
});
