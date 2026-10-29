import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canReadPost,
  canReadPostBody,
  canReadPostInCommunity,
  gatedPostTeaser,
  mergeFounderStubs,
  redactGatedPost,
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
    const admin = { isAdmin: true, isFounder: false, isPremium: false };
    assert.equal(canReadPostBody("founder-only", admin), true);
    assert.equal(canReadPostBody("premium", admin), true);
  });
  it("free fans are blocked from premium and founder-only", () => {
    const free = { isAdmin: false, isFounder: false, isPremium: false };
    assert.equal(canReadPostBody("premium", null), false);
    assert.equal(canReadPostBody("premium", free), false);
    assert.equal(canReadPostBody("founder-only", free), false);
  });
  it("premium reads premium but not founder-only", () => {
    const premium = { isAdmin: false, isFounder: false, isPremium: true };
    assert.equal(canReadPostBody("premium", premium), true);
    assert.equal(canReadPostBody("founder-only", premium), false);
  });
  it("a founder who is not premium reads founder-only but not premium", () => {
    // Founding Fan is not a paid tier. canAccess / is_premium do not
    // treat is_founder as a superset of Premium.
    const founder = { isAdmin: false, isFounder: true, isPremium: false };
    assert.equal(canReadPostBody("founder-only", founder), true);
    assert.equal(canReadPostBody("premium", founder), false);
  });
  it("a founder who is also premium reads both", () => {
    const both = { isAdmin: false, isFounder: true, isPremium: true };
    assert.equal(canReadPostBody("premium", both), true);
    assert.equal(canReadPostBody("founder-only", both), true);
  });
});

describe("canReadPost and redactGatedPost", () => {
  const secret = {
    visibility: "premium" as const,
    author_id: "author",
    body: "backstage lyrics",
    image_url: "https://cdn.example/secret.jpg",
    video_url: "https://cdn.example/secret.mp4",
    video_poster_url: "https://cdn.example/poster.jpg",
    image_alt: "the unreleased single",
    thread_summary: "fans are guessing the title",
  };
  const free = { isAdmin: false, isFounder: false, isPremium: false, fanId: "fan" };

  it("the author keeps their own gated post", () => {
    assert.equal(canReadPost(secret, { ...free, fanId: "author" }), true);
    assert.equal(redactGatedPost(secret, { ...free, fanId: "author" }).body, secret.body);
  });

  it("a free fan gets an empty body and no media", () => {
    assert.equal(canReadPost(secret, free), false);
    const redacted = redactGatedPost(secret, free);
    assert.equal(redacted.body, "");
    assert.equal(redacted.image_url, null);
    assert.equal(redacted.video_url, null);
    assert.equal(redacted.video_poster_url, null);
    assert.equal(redacted.image_alt, null);
    assert.equal(redacted.thread_summary, null);
    assert.equal(gatedPostTeaser("premium"), "Premium post");
    assert.equal(gatedPostTeaser("founder-only"), "Founders-only post");
  });

  it("staff and the right community tier read; the other community does not", () => {
    const post = { ...secret, artist_slug: "raelynn" };
    assert.equal(
      canReadPostInCommunity(post, {
        fanId: "fan",
        premiumCommunities: [],
        founderCommunities: [],
      }),
      false,
    );
    assert.equal(
      canReadPostInCommunity(post, {
        fanId: "fan",
        premiumCommunities: ["raelynn"],
        founderCommunities: [],
      }),
      true,
    );
    assert.equal(
      canReadPostInCommunity(
        { ...post, visibility: "founder-only" },
        { fanId: "fan", premiumCommunities: ["raelynn"], founderCommunities: [] },
      ),
      false,
    );
    assert.equal(
      canReadPostInCommunity(post, {
        fanId: "fan",
        premiumCommunities: [],
        founderCommunities: [],
        staffCommunities: ["*"],
      }),
      true,
    );
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
    assert.match(gate, /\.select\("id, title, kind, pinned, created_at, visibility"\)/);
    assert.match(gate, /locked_community_post_stubs/);
    assert.doesNotMatch(gate, /select\([^)]*body/);
  });

  it("0091 replaces the two permissive select policies on community_posts", () => {
    const sql = readRepo("../../../supabase/migrations/0091_presave_and_ai_gates.sql");
    assert.match(sql, /drop policy if exists community_posts_select on public\.community_posts/);
    assert.match(sql, /visibility is distinct from 'founder-only'/);
    assert.match(sql, /public\.is_founder\(auth\.uid\(\), artist_slug\)/);
  });
});
