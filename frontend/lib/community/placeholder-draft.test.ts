import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isPlaceholderDraftPost,
  rejectPlaceholderDraftPosts,
} from "./placeholder-draft.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const seededNote = {
  title: "[Placeholder / draft] Team note",
  body: "Draft placeholder from the Fan Engage team. Kevin will replace this with RaeLynn-approved copy. This is not from RaeLynn.",
  tags: ["placeholder", "draft"],
};

const seededPoll = {
  title: "[Placeholder / draft] Room poll",
  body: "Placeholder poll for the room. Kevin will replace the question and options with RaeLynn-approved copy. This is not from RaeLynn.",
  tags: ["placeholder", "draft"],
};

const livePost = {
  title: "Tour dates just dropped",
  body: "2026 summer run — 12 cities across the South + Midwest.",
  tags: ["tour-announcements"],
};

describe("placeholder / draft posts are not fan-visible", () => {
  it("flags the seeded team note and room poll", () => {
    assert.equal(isPlaceholderDraftPost(seededNote), true);
    assert.equal(isPlaceholderDraftPost(seededPoll), true);
    assert.equal(
      isPlaceholderDraftPost({
        title: "[Placeholder] Option A — Kevin will replace",
        body: "vote",
      }),
      true,
    );
  });

  it("keeps real fan posts", () => {
    assert.equal(isPlaceholderDraftPost(livePost), false);
    assert.equal(
      isPlaceholderDraftPost({
        title: "What is your favorite RaeLynn song?",
        body: "Mine changes every week.",
      }),
      false,
    );
  });

  it("honors inactive/draft flags when present", () => {
    assert.equal(isPlaceholderDraftPost({ title: "Hi", body: "x", status: "draft" }), true);
    assert.equal(isPlaceholderDraftPost({ title: "Hi", body: "x", active: false }), true);
    assert.equal(isPlaceholderDraftPost({ title: "Hi", body: "x", published: false }), true);
    assert.equal(isPlaceholderDraftPost({ title: "Hi", body: "x", status: "published" }), false);
  });

  it("does not return draft rows to a fan feed", () => {
    const visible = rejectPlaceholderDraftPosts([
      seededNote,
      livePost,
      seededPoll,
    ]);
    assert.deepEqual(
      visible.map((p) => p.title),
      ["Tour dates just dropped"],
    );
    assert.equal(
      visible.some((p) => /placeholder\s*\/\s*draft/i.test(p.title ?? "")),
      false,
    );
  });

  it("fan-facing loaders filter drafts (community feed, hub, home, search)", () => {
    const communitySrc = readRepo("../data/community.ts");
    const hubSrc = readRepo("../../components/artist-hub-room.tsx");
    const latestSrc = readRepo("../../components/latest-strip.tsx");
    const homeSrc = readRepo("../data/fan-home.ts");
    const feedSrc = readRepo("../personal-feed/compute.ts");
    const searchSrc = readRepo("../search/query.ts");

    assert.match(communitySrc, /rejectPlaceholderDraftPosts|isPlaceholderDraftPost/);
    assert.match(hubSrc, /getPostsByArtist/);
    assert.match(latestSrc, /isPlaceholderDraftPost/);
    assert.match(homeSrc, /rejectPlaceholderDraftPosts|isPlaceholderDraftPost/);
    assert.match(feedSrc, /isPlaceholderDraftPost/);
    assert.match(searchSrc, /isPlaceholderDraftPost/);
  });
});
