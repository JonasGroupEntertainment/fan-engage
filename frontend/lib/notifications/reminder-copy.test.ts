import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dropExpiringCopy,
  dropLaunchedCopy,
  firstPlaceCopy,
  leaderboardUrl,
  monthEndNudgeCopy,
  overtakenCopy,
  type ReminderCopy,
} from "./reminder-copy.ts";

const EM_DASH = new RegExp(String.fromCharCode(0x2014));
const STALE_WORDS = /\b(just|now|tonight|today|min)\b/i;

function allText(copy: ReminderCopy): string {
  return `${copy.title} ${copy.body} ${copy.inboxBody}`;
}

describe("leaderboard reminder copy", () => {
  it("links to the artist's leaderboard, or the community resolver without a slug", () => {
    assert.equal(leaderboardUrl("raelynn"), "/artists/raelynn/leaderboard");
    assert.equal(leaderboardUrl(null), "/community");
    assert.equal(leaderboardUrl("  "), "/community");
  });

  it("tells an overtaken fan their new rank and how to climb", () => {
    const copy = overtakenCopy({ artistName: "RaeLynn", artistSlug: "raelynn", newRank: 4 });
    assert.equal(copy.title, "You dropped to #4 on RaeLynn");
    assert.equal(copy.body, "Someone passed you since yesterday. Earn points to climb back up.");
    assert.equal(
      copy.inboxBody,
      "Someone passed you on this month's leaderboard. Check-ins, RSVPs, shares, posts, comments and reactions all add to your score.",
    );
    assert.equal(copy.url, "/artists/raelynn/leaderboard");
  });

  it("celebrates first place", () => {
    const copy = firstPlaceCopy({ artistName: "RaeLynn", artistSlug: "raelynn" });
    assert.equal(copy.title, "You're #1 on RaeLynn! 🥇");
    assert.match(copy.inboxBody, /^You reached the top of this month's leaderboard\./);
  });

  it("counts the days left and never says zero days", () => {
    const nudge = (daysLeft: number) =>
      monthEndNudgeCopy({ artistName: "RaeLynn", artistSlug: "raelynn", rank: 5, daysLeft });
    assert.equal(nudge(3).title, "3 days left on RaeLynn");
    assert.equal(nudge(1).title, "1 day left on RaeLynn");
    assert.equal(nudge(0).title, "Last day on RaeLynn this month");
    assert.equal(
      nudge(3).body,
      "You're at #5. Final push to lock in your spot before the month resets!",
    );
    assert.match(nudge(3).inboxBody, /^You were at #5 when this was sent\./);
  });
});

describe("drop reminder copy", () => {
  it("announces a drop with its description", () => {
    const copy = dropLaunchedCopy({
      artistName: "RaeLynn",
      artistSlug: "raelynn",
      rewardTitle: "Signed poster",
      rewardDescription: "Only 20  of them.",
    });
    assert.equal(copy.title, "RaeLynn: new drop");
    assert.equal(copy.body, "Signed poster: Only 20 of them.");
    assert.equal(copy.inboxBody, "Signed poster: Only 20 of them.");
    assert.equal(copy.url, "/artists/raelynn/rewards");
  });

  it("announces a drop without a description", () => {
    const copy = dropLaunchedCopy({ artistName: "RaeLynn", artistSlug: "raelynn", rewardTitle: "Signed poster" });
    assert.equal(copy.body, "Signed poster just dropped.");
    assert.equal(copy.inboxBody, "Signed poster is a limited-time drop. Redeem it while it is open.");
  });

  it("warns that a drop is closing", () => {
    const copy = dropExpiringCopy({ artistSlug: "raelynn", rewardTitle: "Signed poster", minutesLeft: 42.4 });
    assert.equal(copy.title, "Signed poster ends soon");
    assert.equal(copy.body, "Last 42 min to redeem this drop.");
    assert.equal(dropExpiringCopy({ artistSlug: "raelynn", rewardTitle: "x", minutesLeft: 0 }).body, "Last 1 min to redeem this drop.");
  });
});

describe("copy style", () => {
  const samples: ReminderCopy[] = [
    overtakenCopy({ artistName: "RaeLynn", artistSlug: "raelynn", newRank: 4 }),
    firstPlaceCopy({ artistName: "RaeLynn", artistSlug: "raelynn" }),
    monthEndNudgeCopy({ artistName: "RaeLynn", artistSlug: "raelynn", rank: 5, daysLeft: 2 }),
    dropLaunchedCopy({ artistName: "RaeLynn", artistSlug: "raelynn", rewardTitle: "Signed poster" }),
    dropExpiringCopy({ artistSlug: "raelynn", rewardTitle: "Signed poster", minutesLeft: 40 }),
  ];

  it("has no em dashes", () => {
    for (const copy of samples) assert.doesNotMatch(allText(copy), EM_DASH);
  });

  it("keeps the inbox wording free of words that go stale", () => {
    for (const copy of samples) assert.doesNotMatch(copy.inboxBody, STALE_WORDS);
  });
});
