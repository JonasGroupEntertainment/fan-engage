import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROOF_MIN_ARTISTS,
  PROOF_MIN_FOUNDING_FANS,
  countdownLabel,
  daysUntil,
  shouldShowProofTiles,
} from "./landing-display.ts";

describe("shouldShowProofTiles", () => {
  it("hides tiles when numbers are small (today: 1 artist, 20 founding fans)", () => {
    assert.equal(shouldShowProofTiles({ activeArtists: 1, foundingFans: 20 }), false);
  });

  it("hides tiles when only one minimum is met", () => {
    assert.equal(
      shouldShowProofTiles({ activeArtists: PROOF_MIN_ARTISTS, foundingFans: 0 }),
      false,
    );
    assert.equal(
      shouldShowProofTiles({ activeArtists: 0, foundingFans: PROOF_MIN_FOUNDING_FANS }),
      false,
    );
  });

  it("shows tiles once both minimums are met", () => {
    assert.equal(
      shouldShowProofTiles({
        activeArtists: PROOF_MIN_ARTISTS,
        foundingFans: PROOF_MIN_FOUNDING_FANS,
      }),
      true,
    );
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-10-11T12:00:00Z");

  it("counts whole days ahead", () => {
    assert.equal(daysUntil("2026-10-14T12:00:00Z", now), 3);
  });

  it("returns 0 for later today and 1 for tomorrow", () => {
    assert.equal(daysUntil("2026-10-11T23:00:00Z", now), 0);
    assert.equal(daysUntil("2026-10-12T13:00:00Z", now), 1);
  });

  it("returns null for missing, bad, or past dates", () => {
    assert.equal(daysUntil(null, now), null);
    assert.equal(daysUntil("Coming soon", now), null);
    assert.equal(daysUntil("2026-10-10T12:00:00Z", now), null);
  });
});

describe("countdownLabel", () => {
  it("uses friendly words for today and tomorrow", () => {
    assert.equal(countdownLabel(0), "Tonight");
    assert.equal(countdownLabel(1), "Tomorrow");
  });

  it("uses a day count otherwise, and null when unknown", () => {
    assert.equal(countdownLabel(3), "In 3 days");
    assert.equal(countdownLabel(null), null);
  });
});
