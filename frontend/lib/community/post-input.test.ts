import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCommunityPostRow,
  readPostInput,
  resolveScheduledFor,
  shouldNotifyAtCreate,
} from "./post-input.ts";

const now = new Date("2026-10-29T12:00:00.000Z");
const future = "2026-10-29T15:30:00.000Z";

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

describe("readPostInput", () => {
  it("normalises every composer field", () => {
    const input = readPostInput(
      form({
        kind: "Announcement",
        title: "  Tour dates  ",
        body: "  hello  ",
        visibility: "premium",
        image_url: "https://x/img.jpg",
        video_url: "not-a-url",
        video_poster_url: "",
        image_alt: " alt ",
        ai_suggested_tags: "Tour, , live,toolongtagtoolongtagtoolongtag",
        caption_used: "1",
        scheduled_for: future,
        option: ["A", " ", "B"],
      }),
    );
    assert.equal(input.kind, "announcement");
    assert.equal(input.title, "Tour dates");
    assert.equal(input.body, "hello");
    assert.equal(input.visibility, "premium");
    assert.equal(input.imageUrl, "https://x/img.jpg");
    assert.equal(input.videoUrl, null);
    assert.equal(input.videoPosterUrl, null);
    assert.equal(input.imageAlt, "alt");
    assert.deepEqual(input.tags, ["tour", "live"]);
    assert.equal(input.captionUsed, true);
    assert.equal(input.scheduledForRaw, future);
    assert.deepEqual(input.pollOptions, ["A", "B"]);
  });

  it("defaults: kind post, no title, nothing scheduled", () => {
    const input = readPostInput(form({ body: "x" }));
    assert.equal(input.kind, "post");
    assert.equal(input.title, null);
    assert.equal(input.visibility, null);
    assert.equal(input.scheduledForRaw, null);
    assert.deepEqual(input.tags, []);
    assert.equal(input.captionUsed, false);
  });
});

describe("resolveScheduledFor / shouldNotifyAtCreate", () => {
  it("only team authors may schedule, and only into the future", () => {
    assert.equal(resolveScheduledFor(future, { hasTeamGrant: false, now }), null);
    assert.equal(resolveScheduledFor(future, { hasTeamGrant: true, now }), future);
    assert.equal(resolveScheduledFor("2026-10-29T11:00:00.000Z", { hasTeamGrant: true, now }), null);
    assert.equal(resolveScheduledFor("garbage", { hasTeamGrant: true, now }), null);
    assert.equal(resolveScheduledFor("", { hasTeamGrant: true, now }), null);
  });

  it("a future scheduled post is not announced at creation", () => {
    assert.equal(shouldNotifyAtCreate(null, now), true);
    assert.equal(shouldNotifyAtCreate(future, now), false);
    assert.equal(shouldNotifyAtCreate("2026-10-29T11:00:00.000Z", now), true);
  });
});

describe("buildCommunityPostRow", () => {
  const ctx = { artistSlug: "raelynn", authorId: "u1", now };

  it("fan post: forced public, kind post, tags array, no schedule keys", () => {
    const res = buildCommunityPostRow(
      readPostInput(form({ kind: "announcement", body: "hi", visibility: "founder-only", scheduled_for: future, title: "T" })),
      { ...ctx, hasTeamGrant: false },
    );
    assert.ok(res.ok);
    assert.deepEqual(res.row, {
      artist_slug: "raelynn",
      author_id: "u1",
      kind: "post",
      title: null,
      body: "hi",
      visibility: "public",
      pinned: false,
      image_url: null,
      video_url: null,
      video_poster_url: null,
      caption_used: false,
      tags: [],
      image_alt: null,
    });
    assert.equal("scheduled_for" in res.row, false);
    assert.equal(res.notifyAtCreate, true);
  });

  it("team announcement: pinned, keeps title + visibility", () => {
    const res = buildCommunityPostRow(
      readPostInput(form({ kind: "announcement", title: "T", body: "hi", visibility: "founder-only" })),
      { ...ctx, hasTeamGrant: true },
    );
    assert.ok(res.ok);
    assert.equal(res.row.kind, "announcement");
    assert.equal(res.row.pinned, true);
    assert.equal(res.row.title, "T");
    assert.equal(res.row.visibility, "founder-only");
    assert.equal(res.notifyAtCreate, true);
  });

  it("team scheduled post: scheduled_for + created_at set, notify deferred", () => {
    const res = buildCommunityPostRow(
      readPostInput(form({ body: "later", scheduled_for: future })),
      { ...ctx, hasTeamGrant: true },
    );
    assert.ok(res.ok);
    assert.equal(res.row.scheduled_for, future);
    assert.equal(res.row.created_at, future);
    assert.equal(res.notifyAtCreate, false);
  });

  it("poll: needs 2..6 options, drops media", () => {
    const bad = buildCommunityPostRow(
      readPostInput(form({ kind: "poll", body: "q", option: ["only"] })),
      { ...ctx, hasTeamGrant: true },
    );
    assert.deepEqual(bad, { ok: false, reason: "poll_options" });
    const good = buildCommunityPostRow(
      readPostInput(form({ kind: "poll", body: "q", option: ["a", "b"], image_url: "https://x/i.jpg" })),
      { ...ctx, hasTeamGrant: true },
    );
    assert.ok(good.ok);
    assert.deepEqual(good.pollOptions, ["a", "b"]);
    assert.equal(good.row.image_url, null);
  });

  it("rejects empty and over-long bodies", () => {
    assert.deepEqual(
      buildCommunityPostRow(readPostInput(form({ body: "  " })), { ...ctx, hasTeamGrant: false }),
      { ok: false, reason: "empty_body" },
    );
    assert.deepEqual(
      buildCommunityPostRow(readPostInput(form({ body: "x".repeat(2001) })), { ...ctx, hasTeamGrant: false }),
      { ok: false, reason: "body_too_long" },
    );
  });
});
