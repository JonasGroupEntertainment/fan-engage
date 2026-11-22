import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatPointsToast, pointsProgress } from "./points/progress.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("the note a fan sees after an RSVP", () => {
  it("names the points earned and the next tier", () => {
    // Arrange: 730 lifetime points before, 740 after the +10 RSVP award. Silver starts at 750.
    const progress = pointsProgress(730, 740);

    // Act
    const note = formatPointsToast(progress);

    // Assert
    assert.equal(note, "+10 pts · 10 to Silver");
  });

  it("is empty when the RSVP earned nothing, such as a second RSVP to the same event", () => {
    assert.equal(formatPointsToast(pointsProgress(740, 740)), null);
  });
});

describe("where the RSVP note is wired", () => {
  const action = read("../app/artists/[slug]/rsvp-actions.ts");
  const button = read("../app/artists/[slug]/rsvp-button.tsx");

  it("the action measures points around the RSVP insert and returns them", () => {
    assert.match(action, /withPointsProgress\(user\.id, \(\) =>\s*writer\.from\("event_rsvps"\)\.insert\(/);
    assert.match(action, /return \{ ok: true as const, progress \};/);
  });

  it("cancelling an RSVP reports no points", () => {
    const cancel = action.slice(action.indexOf("if (!wantRsvp)"), action.indexOf("loadEventRsvpSchedule(eventId)"));
    assert.match(cancel, /return \{ ok: true as const \};/);
    assert.doesNotMatch(cancel, /withPointsProgress/);
  });

  it("the button shows the note from the shared copy, and clears it on cancel", () => {
    assert.match(button, /formatPointsToast\(result\.progress\)/);
    assert.match(button, /data-rsvp-points-note/);
    assert.match(button, /setPointsNote\(null\)/);
    assert.match(button, /<span role="status" className="sr-only">/);
  });
});
