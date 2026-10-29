import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Scoping guard for the brief's reads. community_posts.community_id and
 * artist_events.community_id are never set by the app (0011 gave them a
 * default of 'raelynn'), so filtering on them would give every other
 * artist zero posts and hand RaeLynn everyone's. The app-written column is
 * artist_slug, on the table or through the parent post / event.
 */
describe("lib/team-brief/data.ts scoping", () => {
  const src = readFileSync(fileURLToPath(new URL("./data.ts", import.meta.url)), "utf8");
  const query = (table: string) => {
    const re = new RegExp(`from\\("${table}"\\)[\\s\\S]*?order\\(`, "g");
    const hits = src.match(re) ?? [];
    assert.ok(hits.length > 0, `no query on ${table}`);
    return hits;
  };

  it("never filters community_posts or artist_events by community_id", () => {
    for (const table of ["community_posts", "artist_events"]) {
      for (const q of query(table)) {
        assert.doesNotMatch(q, /\.eq\("community_id"/, q);
        assert.match(q, /\.eq\("artist_slug", slug\)/, q);
      }
    }
  });

  it("joins comments, reactions and RSVPs to the parent on artist_slug", () => {
    for (const table of ["community_comments", "community_reactions"]) {
      for (const q of query(table)) {
        assert.match(q, /community_posts!inner\(artist_slug\)/, q);
        assert.match(q, /\.eq\("community_posts\.artist_slug", slug\)/, q);
        assert.doesNotMatch(q, /community_id/, q);
      }
    }
    for (const q of query("event_rsvps")) {
      assert.match(q, /artist_events!inner\(artist_slug\)/, q);
      assert.match(q, /\.eq\("artist_events\.artist_slug", slug\)/, q);
      assert.doesNotMatch(q, /community_id/, q);
    }
  });

  it("keeps community_id only where the RPCs set it (ledger, redemptions, thanks, memberships, admin_users)", () => {
    for (const table of ["points_ledger", "reward_redemptions", "superfan_thanks", "fan_community_memberships", "admin_users"]) {
      for (const q of query(table)) assert.match(q, /\.eq\("community_id", slug\)/, q);
    }
  });
});
