import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_THANK_LIMIT,
  THANK_COOLDOWN_DAYS,
  daysSince,
  engagementScore,
  selectSuperfansToThank,
  thankScoreLegend,
  thankYouTemplate,
  type ThankCandidateInput,
} from "./to-thank.ts";

const NOW = new Date("2026-10-29T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

function fan(over: Partial<ThankCandidateInput> & { fanId: string }): ThankCandidateInput {
  return {
    pointsEarned: 0,
    comments: 0,
    reactions: 0,
    checkins: 0,
    rsvps: 0,
    redemptions: 0,
    lastActiveAt: daysAgo(3),
    isInternal: false,
    thankedAt: null,
    ...over,
  };
}

describe("engagementScore", () => {
  it("weights check-ins and RSVPs highest, points at 1 per 100", () => {
    const { score, breakdown } = engagementScore({
      fanId: "a",
      pointsEarned: 250,
      comments: 3,
      reactions: 4,
      checkins: 1,
      rsvps: 2,
      redemptions: 1,
      lastActiveAt: null,
    });
    assert.deepEqual(breakdown, { checkins: 5, rsvps: 10, comments: 6, redemptions: 2, reactions: 4, points: 2 });
    assert.equal(score, 29);
  });

  it("never credits negative points", () => {
    assert.equal(engagementScore(fan({ fanId: "a", pointsEarned: -500 })).breakdown.points, 0);
  });
});

describe("selectSuperfansToThank", () => {
  it("ranks by score, drops internal accounts, zero scores and recently thanked fans", () => {
    const picked = selectSuperfansToThank(
      [
        fan({ fanId: "quiet" }),
        fan({ fanId: "staff", checkins: 9, isInternal: true }),
        fan({ fanId: "thanked", checkins: 9, thankedAt: daysAgo(10) }),
        fan({ fanId: "old-thanks", checkins: 2, thankedAt: daysAgo(THANK_COOLDOWN_DAYS + 1) }),
        fan({ fanId: "top", checkins: 1, rsvps: 1, comments: 2 }),
        fan({ fanId: "reactor", reactions: 3 }),
      ],
      { now: NOW },
    );
    assert.deepEqual(
      picked.map((c) => [c.fanId, c.score]),
      [
        ["top", 14],
        ["old-thanks", 10],
        ["reactor", 3],
      ],
    );
    assert.equal(picked[0].daysSinceActivity, 3);
  });

  it("breaks ties on newer activity, then fan id, and honours the limit", () => {
    const picked = selectSuperfansToThank(
      [
        fan({ fanId: "b", comments: 1, lastActiveAt: daysAgo(5) }),
        fan({ fanId: "a", comments: 1, lastActiveAt: daysAgo(5) }),
        fan({ fanId: "c", comments: 1, lastActiveAt: daysAgo(1) }),
      ],
      { now: NOW, limit: 2 },
    );
    assert.deepEqual(
      picked.map((c) => c.fanId),
      ["c", "a"],
    );
  });

  it("defaults to ten and a sixty-day cooldown", () => {
    assert.equal(DEFAULT_THANK_LIMIT, 10);
    assert.equal(THANK_COOLDOWN_DAYS, 60);
    const many = Array.from({ length: 25 }, (_, i) => fan({ fanId: `f${i}`, reactions: 1 }));
    assert.equal(selectSuperfansToThank(many, { now: NOW }).length, 10);
  });

  it("daysSince floors to whole days and rejects garbage", () => {
    assert.equal(daysSince(daysAgo(2.9), NOW), 2);
    assert.equal(daysSince("not a date", NOW), null);
    assert.equal(daysSince(null, NOW), null);
  });

  it("legend names every weight", () => {
    const legend = thankScoreLegend();
    for (const word of ["check-in", "RSVP", "comment", "redemption", "reaction", "100 points"]) {
      assert.ok(legend.includes(word), word);
    }
  });
});

describe("thankYouTemplate", () => {
  it("names the fan by first name and the artist, with fallbacks", () => {
    const t = thankYouTemplate({ fanName: "Ada Lovelace", artistName: "Artist One" });
    assert.ok(t.startsWith("Hey Ada — "));
    assert.ok(t.includes("showing up for Artist One"));
    assert.ok(!t.includes("Lovelace"));
    const fallback = thankYouTemplate({ fanName: "  ", artistName: "" });
    assert.ok(fallback.startsWith("Hey there — "));
    assert.ok(fallback.includes("for the team"));
  });
});
