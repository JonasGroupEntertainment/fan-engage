import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { postAnchorId, postCommunityHref } from "./post-anchor.ts";

test("a post's anchor id and community link point at the same spot", () => {
  assert.equal(postAnchorId("abc-123"), "post-abc-123");
  assert.equal(postCommunityHref("raelynn", "abc-123"), "/artists/raelynn/community#post-abc-123");
});

test("each post on the community page carries the anchor that links jump to", () => {
  const card = readFileSync(new URL("../../app/artists/[slug]/community/post-card.tsx", import.meta.url), "utf8");
  assert.match(card, /<article\s+id=\{postAnchorId\(post\.id\)\}/);
});

test("'You might have missed' cards link to the post itself", () => {
  const picked = readFileSync(new URL("../../components/personal/picked-for-you.tsx", import.meta.url), "utf8");
  assert.match(picked, /href=\{postCommunityHref\(artistSlug, post\.id\)\}/);
});
