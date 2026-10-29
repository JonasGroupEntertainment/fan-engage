import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canReadPostBody,
  mergeFounderStubs,
  resolveAuthorVisibility,
  stubToLockedPost,
  type FeedPostLike,
} from "./core.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

type Row = FeedPostLike & { title: string | null; body: string; kind: string };

const row = (id: string, created_at: string, pinned = false, visibility: Row["visibility"] = "public"): Row => ({
  id,
  pinned,
  created_at,
  visibility,
  title: null,
  body: `body ${id}`,
  kind: "post",
});

describe("canReadPostBody", () => {
  it("public is open to everyone, signed out included", () => {
    assert.equal(canReadPostBody("public", null), true);
  });
  it("founder-only needs a founder; premium does not unlock it", () => {
    const premium = { isAdmin: false, isFounder: false, isPremium: true };
    const founder = { isAdmin: false, isFounder: true, isPremium: false };
    assert.equal(canReadPostBody("founder-only", null), false);
    assert.equal(canReadPostBody("founder-only", premium), false);
    assert.equal(canReadPostBody("founder-only", founder), true);
  });
  it("admins read everything", () => {
    assert.equal(canReadPostBody("founder-only", { isAdmin: true, isFounder: false, isPremium: false }), true);
  });
});

describe("resolveAuthorVisibility", () => {
  it("fans are always public, whatever they send", () => {
    assert.equal(resolveAuthorVisibility("founder-only", { hasTeamGrant: false }), "public");
    assert.equal(resolveAuthorVisibility("premium", { hasTeamGrant: false }), "public");
  });
  it("team authors may pick premium or founder-only; junk falls back to public", () => {
    assert.equal(resolveAuthorVisibility("founder-only", { hasTeamGrant: true }), "founder-only");
    assert.equal(resolveAuthorVisibility("Premium ", { hasTeamGrant: true }), "premium");
    assert.equal(resolveAuthorVisibility("secret", { hasTeamGrant: true }), "public");
    assert.equal(resolveAuthorVisibility(null, { hasTeamGrant: true }), "public");
  });
});

describe("stubToLockedPost + mergeFounderStubs", () => {
  it("a stub carries no body and is marked founder-only", () => {
    const locked = stubToLockedPost<Row>(
      { id: "s1", title: "Studio day", kind: "announcement", pinned: false, created_at: "2026-10-28T00:00:00Z" },
      {},
    );
    assert.equal(locked.body, "");
    assert.equal(locked.visibility, "founder-only");
    assert.equal(locked.title, "Studio day");
  });

  it("merges by pinned-then-newest and never duplicates a readable row", () => {
    const visible = [row("p1", "2026-10-29T00:00:00Z", true), row("a", "2026-10-27T00:00:00Z")];
    const stubs = [
      row("s1", "2026-10-28T00:00:00Z", false, "founder-only"),
      row("a", "2026-10-27T00:00:00Z", false, "founder-only"), // already readable
    ];
    const merged = mergeFounderStubs(visible, stubs);
    assert.deepEqual(
      merged.map((p) => p.id),
      ["p1", "s1", "a"],
    );
  });

  it("returns the feed untouched when there are no stubs", () => {
    const visible = [row("b", "2026-10-27T00:00:00Z"), row("a", "2026-10-29T00:00:00Z")];
    assert.deepEqual(mergeFounderStubs(visible, []).map((p) => p.id), ["b", "a"]);
  });
});

describe("the feed path uses these helpers", () => {
  it("createPostAction resolves visibility through the team-author rule", () => {
    // Sprint 4: the row builder moved to lib/community/post-input.ts (shared
    // with the artist-portal composer); it is the one place that calls
    // resolveAuthorVisibility, fed by the same communityAdminUser grant.
    const actions = readRepo("../../app/artists/[slug]/community/actions.ts");
    assert.match(actions, /communityAdminUser\(artistSlug, "editor"\)/);
    assert.match(actions, /buildCommunityPostRow\(input, \{[\s\S]*?hasTeamGrant: teamAuthor !== null/);
    const builder = readRepo("../community/post-input.ts");
    assert.match(builder, /resolveAuthorVisibility\(input\.visibility, \{ hasTeamGrant: ctx\.hasTeamGrant \}\)/);
  });

  it("the stub reader never selects the body", () => {
    const gate = readRepo("../../app/artists/[slug]/community/founder-gate.ts");
    assert.match(gate, /\.select\("id, title, kind, pinned, created_at"\)/);
    assert.doesNotMatch(gate, /select\([^)]*body/);
  });

  it("0091 replaces the two permissive select policies on community_posts", () => {
    const sql = readRepo("../../../supabase/migrations/0091_presave_and_ai_gates.sql");
    assert.match(sql, /drop policy if exists community_posts_select on public\.community_posts/);
    assert.match(sql, /visibility is distinct from 'founder-only'/);
    assert.match(sql, /public\.is_founder\(auth\.uid\(\), artist_slug\)/);
  });
});
