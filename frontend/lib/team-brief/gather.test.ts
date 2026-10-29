import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  briefPeriod,
  buildEngagement,
  engagementCutoffIso,
  gatherTeamBrief,
  type TeamBriefRaw,
} from "./gather.ts";

// A Monday 13:00 UTC run (the cron's slot).
const NOW = new Date("2026-11-02T13:00:00Z");
const PERIOD = { start: "2026-10-26T00:00:00.000Z", end: "2026-11-02T00:00:00.000Z" };
const inWeek = (day: number, hour = 12) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const beforeWeek = "2026-10-20T12:00:00.000Z";
const afterWeek = "2026-11-02T01:00:00.000Z";

function raw(over: Partial<TeamBriefRaw> = {}): TeamBriefRaw {
  return {
    community: { slug: "artist-one", displayName: "Artist One" },
    period: PERIOD,
    team: [{ user_id: "staff-1", role: "owner" }],
    follows: [],
    posts: [],
    comments: [],
    reactions: [],
    checkins: [],
    rsvps: [],
    redemptions: [],
    ledger: [],
    events: [],
    pendingDrafts: 0,
    thanks: [],
    fans: [
      { id: "staff-1", email: "s@example.com", first_name: "Sam", last_name: "Staff", is_internal: false, profile_slug: "sam", public_profile_enabled: true },
      { id: "fan-a", email: "a@example.com", first_name: "Ada", last_name: "A", is_internal: false, profile_slug: "ada", public_profile_enabled: true },
      { id: "fan-b", email: "b@example.com", first_name: "Bo", last_name: null, is_internal: false, profile_slug: "bo", public_profile_enabled: false },
      { id: "fan-i", email: "i@example.com", first_name: "Ina", last_name: "Internal", is_internal: true, profile_slug: null, public_profile_enabled: true },
    ],
    memberships: [{ fan_id: "fan-a", current_tier: "gold", total_points: 900 }],
    ...over,
  };
}

describe("briefPeriod", () => {
  it("is the completed Monday→Monday week before the run, with its Monday as week_start", () => {
    assert.deepEqual(briefPeriod(NOW), { ...PERIOD, weekStart: "2026-11-02" });
    // Any day of the week rolls back to the same window.
    assert.equal(briefPeriod(new Date("2026-11-05T09:00:00Z")).start, PERIOD.start);
    assert.equal(engagementCutoffIso(PERIOD.end), "2026-10-03T00:00:00.000Z");
  });
});

describe("gatherTeamBrief", () => {
  it("counts only rows inside the window and splits posts by team vs fans", () => {
    const data = gatherTeamBrief(
      raw({
        follows: [{ fan_id: "fan-a", at: inWeek(27) }, { fan_id: "fan-b", at: beforeWeek }, { fan_id: "x", at: afterWeek }],
        posts: [
          { author_id: "staff-1", at: inWeek(28) },
          { author_id: "fan-a", at: inWeek(29) },
          { author_id: "fan-b", at: beforeWeek },
        ],
        comments: [{ author_id: "fan-a", at: inWeek(30) }, { author_id: "fan-b", at: afterWeek }],
        reactions: [{ fan_id: "fan-b", at: inWeek(31) }],
        checkins: [{ fan_id: "fan-a", at: inWeek(26, 0) }],
        rsvps: [{ fan_id: "fan-b", at: inWeek(26) }],
        redemptions: [{ fan_id: "fan-a", at: inWeek(27) }, { fan_id: "fan-a", at: beforeWeek }],
        ledger: [
          { fan_id: "fan-a", delta: 40, at: inWeek(27) },
          { fan_id: "fan-a", delta: -10, at: inWeek(27) },
          { fan_id: "fan-b", delta: 25, at: inWeek(28) },
          { fan_id: "staff-1", delta: 500, at: inWeek(28) },
          { fan_id: "fan-i", delta: 999, at: inWeek(28) },
          { fan_id: "fan-b", delta: 75, at: beforeWeek },
        ],
        pendingDrafts: 2,
      }),
      NOW,
    );
    assert.deepEqual(data.stats, {
      newFollowers: 1,
      postsByFans: 1,
      postsByTeam: 1,
      comments: 1,
      reactions: 1,
      checkins: 1,
      rsvps: 1,
      redemptions: 1,
      pointsAwarded: 40 + 25 + 500 + 999,
      activeFans: 2,
    });
    assert.equal(data.teamSize, 1);
    assert.equal(data.pendingDrafts, 2);
  });

  it("top fans are by points earned this week, named, tiered, linked only when the profile is public, never staff or internal", () => {
    const data = gatherTeamBrief(
      raw({
        ledger: [
          { fan_id: "fan-a", delta: 40, at: inWeek(27) },
          { fan_id: "fan-b", delta: 60, at: inWeek(28) },
          { fan_id: "staff-1", delta: 500, at: inWeek(28) },
          { fan_id: "fan-i", delta: 999, at: inWeek(28) },
          { fan_id: "fan-a", delta: 100, at: beforeWeek },
        ],
      }),
      NOW,
    );
    assert.deepEqual(data.topFans, [
      { fanId: "fan-b", name: "Bo", points: 60, tier: null, profilePath: null },
      { fanId: "fan-a", name: "Ada A", points: 40, tier: "gold", profilePath: "/fans/ada" },
    ]);
  });

  it("keeps at most five top fans", () => {
    const ledger = Array.from({ length: 8 }, (_, i) => ({ fan_id: `f${i}`, delta: 10 + i, at: inWeek(27) }));
    const data = gatherTeamBrief(raw({ ledger }), NOW);
    assert.equal(data.topFans.length, 5);
    assert.equal(data.topFans[0].fanId, "f7");
    assert.equal(data.topFans[0].name, "A fan");
  });

  it("upcoming events use starts_at or the free-form date, within 14 days, sorted", () => {
    const data = gatherTeamBrief(
      raw({
        events: [
          { id: "e1", title: "Later", event_date: "Nov 10, 2026", starts_at: null, ends_at: null, url: "https://t.example/1" },
          { id: "e2", title: "Sooner", event_date: null, starts_at: "2026-11-04T01:00:00Z", ends_at: null, url: null },
          { id: "e3", title: "Too far", event_date: "Dec 1, 2026", starts_at: null, ends_at: null, url: null },
          { id: "e4", title: "Past", event_date: "2026-10-30", starts_at: null, ends_at: null, url: null },
          { id: "e5", title: "TBA", event_date: "Coming soon", starts_at: null, ends_at: null, url: null },
        ],
      }),
      NOW,
    );
    assert.deepEqual(
      data.upcomingEvents.map((e) => [e.id, e.day]),
      [
        ["e2", "2026-11-03"],
        ["e1", "2026-11-10"],
      ],
    );
    assert.equal(data.upcomingEvents[1].url, "https://t.example/1");
  });

  it("superfans to thank come from the 30-day window, skip staff, internal and recently thanked fans", () => {
    const data = gatherTeamBrief(
      raw({
        checkins: [
          { fan_id: "fan-a", at: beforeWeek },
          { fan_id: "fan-b", at: beforeWeek },
          { fan_id: "staff-1", at: inWeek(27) },
          { fan_id: "fan-i", at: inWeek(27) },
        ],
        comments: [{ author_id: "fan-b", at: inWeek(29) }],
        thanks: [{ fan_id: "fan-a", thanked_at: "2026-10-01T00:00:00.000Z" }],
      }),
      NOW,
    );
    assert.deepEqual(
      data.superfansToThank.map((f) => [f.fanId, f.name, f.score, f.tier, f.profilePath]),
      [["fan-b", "Bo", 7, null, null]],
    );
    assert.equal(data.superfansToThank[0].daysSinceActivity, 4);
  });

  it("buildEngagement tracks the newest activity per fan and ignores negative deltas", () => {
    const map = buildEngagement(
      raw({
        ledger: [
          { fan_id: "fan-a", delta: 30, at: inWeek(27) },
          { fan_id: "fan-a", delta: -5, at: inWeek(31) },
        ],
        reactions: [{ fan_id: "fan-a", at: inWeek(29) }],
      }),
    );
    const a = map.get("fan-a")!;
    assert.equal(a.pointsEarned, 30);
    assert.equal(a.reactions, 1);
    assert.equal(a.lastActiveAt, inWeek(29));
  });
});
