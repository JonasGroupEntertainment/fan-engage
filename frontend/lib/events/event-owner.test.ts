import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { eventOwnerColumns } from "./build-event-row.ts";

describe("eventOwnerColumns", () => {
  it("tags a new event to the artist's own community", () => {
    // Arrange
    const artistSlug = "hunter-hawkins";

    // Act
    const owner = eventOwnerColumns(artistSlug);

    // Assert
    assert.deepEqual(owner, {
      artist_slug: "hunter-hawkins",
      community_id: "hunter-hawkins",
    });
  });

  it("trims the slug", () => {
    assert.deepEqual(eventOwnerColumns("  raelynn "), {
      artist_slug: "raelynn",
      community_id: "raelynn",
    });
  });

  it("throws on an empty slug so an event is never saved without an owner", () => {
    assert.throws(() => eventOwnerColumns(""), /artist slug is required/);
    assert.throws(() => eventOwnerColumns("   "), /artist slug is required/);
  });
});

// artist_events.community_id is NOT NULL with a database default of
// 'raelynn'. An insert that leaves it out silently files another artist's
// event under RaeLynn. Every admin writer must set it.
describe("admin event writers set community_id", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

  for (const rel of [
    "../../app/admin/artists/actions.ts",
    "../../app/admin/events/actions.ts",
    "../../app/admin/campaigns/actions.ts",
  ]) {
    it(`${rel} builds the insert with eventOwnerColumns`, () => {
      const src = read(rel);
      assert.match(src, /eventOwnerColumns\(artistSlug\)/);
      // Only artist_events: other tables in these files take artist_slug alone.
      assert.doesNotMatch(src, /from\("artist_events"\)\s*\.insert\(\{\s*artist_slug: artistSlug,/);
      assert.doesNotMatch(src, /const row = \{\s*artist_slug: artistSlug,/);
    });
  }
});
