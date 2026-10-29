import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PORTAL_MIN_ROLE,
  PORTAL_ROLE_RANK,
  canAccessPortalSurface,
  roleAtLeast,
  type PortalRole,
} from "./roles.ts";

const ROLES: PortalRole[] = ["viewer", "editor", "admin", "owner"];

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("portal roleAtLeast", () => {
  it("ranks viewer < editor < admin < owner", () => {
    assert.ok(PORTAL_ROLE_RANK.viewer < PORTAL_ROLE_RANK.editor);
    assert.ok(PORTAL_ROLE_RANK.editor < PORTAL_ROLE_RANK.admin);
    assert.ok(PORTAL_ROLE_RANK.admin < PORTAL_ROLE_RANK.owner);
    for (const role of ROLES) assert.equal(roleAtLeast(role, role), true);
    assert.equal(roleAtLeast("viewer", "editor"), false);
    assert.equal(roleAtLeast("editor", "admin"), false);
    assert.equal(roleAtLeast("admin", "owner"), false);
    assert.equal(roleAtLeast("owner", "viewer"), true);
  });
});

describe("PORTAL_MIN_ROLE matrix", () => {
  it("owner can open everything including team", () => {
    for (const surface of Object.keys(PORTAL_MIN_ROLE) as Array<keyof typeof PORTAL_MIN_ROLE>) {
      assert.equal(canAccessPortalSurface("owner", surface), true, surface);
    }
  });

  it("admin can open everything except team", () => {
    assert.equal(canAccessPortalSurface("admin", "team"), false);
    assert.equal(canAccessPortalSurface("admin", "revenue"), true);
    assert.equal(canAccessPortalSurface("admin", "moderation"), true);
    assert.equal(canAccessPortalSurface("admin", "events"), true);
    assert.equal(canAccessPortalSurface("admin", "redemptions"), true);
    assert.equal(canAccessPortalSurface("admin", "communityPost"), true);
  });

  it("editor gets content, events, redemptions but not revenue or team", () => {
    assert.equal(canAccessPortalSurface("editor", "communityPost"), true);
    assert.equal(canAccessPortalSurface("editor", "events"), true);
    assert.equal(canAccessPortalSurface("editor", "redemptions"), true);
    assert.equal(canAccessPortalSurface("editor", "copilotRefresh"), true);
    assert.equal(canAccessPortalSurface("editor", "revenue"), false);
    assert.equal(canAccessPortalSurface("editor", "moderation"), false);
    assert.equal(canAccessPortalSurface("editor", "team"), false);
  });

  it("viewer is read-only: dashboard, copilot, community view, leaderboard", () => {
    assert.equal(canAccessPortalSurface("viewer", "dashboard"), true);
    assert.equal(canAccessPortalSurface("viewer", "copilot"), true);
    assert.equal(canAccessPortalSurface("viewer", "community"), true);
    assert.equal(canAccessPortalSurface("viewer", "leaderboard"), true);
    assert.equal(canAccessPortalSurface("viewer", "communityPost"), false);
    assert.equal(canAccessPortalSurface("viewer", "events"), false);
    assert.equal(canAccessPortalSurface("viewer", "redemptions"), false);
    assert.equal(canAccessPortalSurface("viewer", "revenue"), false);
    assert.equal(canAccessPortalSurface("viewer", "moderation"), false);
    assert.equal(canAccessPortalSurface("viewer", "team"), false);
  });
});

describe("artist portal source gating", () => {
  const portalDir = fileURLToPath(new URL("../../app/artist-portal/", import.meta.url));
  const files = walk(portalDir);

  it("no inline owner-only admin_users lookups remain outside team/", () => {
    const offenders = files.filter(
      (f) => !f.includes("/team/") && /\.eq\(\s*["']role["']\s*,\s*["']owner["']\s*\)/.test(readFileSync(f, "utf8")),
    );
    assert.deepEqual(offenders, []);
  });

  it("no page redirects the portal root to itself", () => {
    const root = readRepo("../../app/artist-portal/page.tsx");
    assert.doesNotMatch(root, /redirect\("\/artist-portal"\)/);
    assert.match(root, /redirect\("\/login\?next=\/artist-portal"\)/);
    assert.match(root, /not on an artist team yet/);
    assert.match(root, /\/for-artists\/apply/);
  });

  it("every gated page and action goes through the shared portal guards", () => {
    const expectations: Array<[string, RegExp]> = [
      ["../../app/artist-portal/page.tsx", /getPortalContext\(\)/],
      ["../../app/artist-portal/community/page.tsx", /requirePortalPage\("community"/],
      ["../../app/artist-portal/community/actions.ts", /assertPortalRole\("communityPost"\)/],
      ["../../app/artist-portal/events/page.tsx", /requirePortalPage\("events"/],
      ["../../app/artist-portal/events/actions.ts", /assertPortalRole\("events"\)/],
      ["../../app/artist-portal/leaderboard/page.tsx", /requirePortalPage\("leaderboard"/],
      ["../../app/artist-portal/payouts/page.tsx", /requirePortalPage\("revenue"/],
      ["../../app/artist-portal/redemptions/page.tsx", /requirePortalPage\("redemptions"/],
      ["../../app/artist-portal/redemptions/actions.ts", /assertPortalRole\("redemptions"\)/],
      ["../../app/artist-portal/moderation/page.tsx", /requirePortalPage\("moderation"/],
      ["../../app/artist-portal/moderation/actions.ts", /assertPortalRole\("moderation"\)/],
    ];
    for (const [file, re] of expectations) {
      assert.match(readRepo(file), re, file);
    }
  });

  it("revenue page never assumes a default split", () => {
    const src = readRepo("../../app/artist-portal/payouts/page.tsx");
    assert.match(src, /Split not set/);
    assert.doesNotMatch(src, /:\s*80\b/);
    assert.doesNotMatch(src, /\?\?\s*20\b/);
    assert.match(src, />\s*Revenue\s*</);
    assert.match(src, /accountant/);
  });

  it("access.ts guards use the shared matrix", () => {
    const src = readRepo("./access.ts");
    assert.match(src, /export async function requirePortalPage/);
    assert.match(src, /export async function assertPortalRole/);
    assert.match(src, /PORTAL_MIN_ROLE\[surface\]/);
  });
});
