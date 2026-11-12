import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TeamBriefData } from "./gather.ts";
import { TEAM_BRIEF_SUBJECT_MAX, briefRangeLabel, renderTeamBrief, teamBriefSubject } from "./render.ts";

function data(over: Partial<TeamBriefData> = {}): TeamBriefData {
  return {
    community: { slug: "artist-one", displayName: "Artist <One>" },
    period: { start: "2026-10-26T00:00:00.000Z", end: "2026-11-02T00:00:00.000Z" },
    teamSize: 2,
    stats: {
      newFollowers: 12,
      postsByFans: 3,
      postsByTeam: 1,
      comments: 1,
      reactions: 40,
      checkins: 2,
      rsvps: 5,
      redemptions: 0,
      pointsAwarded: 1234,
      activeFans: 18,
    },
    topFans: [
      { fanId: "a", name: "Ada A", points: 300, tier: "gold", profilePath: "/fans/ada" },
      { fanId: "b", name: "Bo & Co", points: 120, tier: null, profilePath: null },
    ],
    upcomingEvents: [{ id: "e1", title: "Show <Night>", day: "2026-11-05", when: "Nov 5", url: "https://tickets.example/1" }],
    pendingDrafts: 2,
    superfansToThank: [
      {
        fanId: "b",
        name: "Bo & Co",
        tier: "silver",
        profilePath: null,
        pointsEarned: 150,
        comments: 2,
        reactions: 3,
        checkins: 1,
        rsvps: 0,
        redemptions: 0,
        lastActiveAt: "2026-10-30T00:00:00.000Z",
        score: 13,
        breakdown: { checkins: 5, rsvps: 0, comments: 4, redemptions: 0, reactions: 3, points: 1 },
        daysSinceActivity: 3,
        thankedAt: null,
      },
    ],
    ...over,
  };
}

describe("teamBriefSubject", () => {
  it("names the artist and the headline counts, singular when one", () => {
    assert.equal(
      teamBriefSubject(data()),
      "Monday brief · Artist <One>: 12 new followers, 4 posts, 1 comment",
    );
  });
  it("caps the length", () => {
    const s = teamBriefSubject(data({ community: { slug: "x", displayName: "A".repeat(200) } }));
    assert.ok(s.length <= TEAM_BRIEF_SUBJECT_MAX);
    assert.ok(s.endsWith("…"));
  });
});

describe("renderTeamBrief", () => {
  const base = "https://www.fanengagepro.com/";
  const out = renderTeamBrief(data(), base);

  it("labels the window as the seven days before the Monday", () => {
    assert.equal(briefRangeLabel(data().period), "Oct 26 – Nov 1");
    assert.ok(out.text.includes("(Oct 26 – Nov 1)"));
  });

  it("puts every number in both bodies", () => {
    for (const needle of ["12", "1,234", "40", "18"]) {
      assert.ok(out.text.includes(needle), `text ${needle}`);
      assert.ok(out.html.includes(needle), `html ${needle}`);
    }
    assert.ok(out.text.includes("Posts by fans: 3"));
    assert.ok(out.text.includes("Posts by your team: 1"));
  });

  it("escapes names and titles in the HTML but not the text", () => {
    assert.ok(out.html.includes("Artist &lt;One&gt;"));
    assert.ok(out.html.includes("Bo &amp; Co"));
    assert.ok(out.html.includes("Show &lt;Night&gt;"));
    assert.ok(!out.html.includes("<One>"));
    assert.ok(out.text.includes("Artist <One>"));
  });

  it("links public profiles, the superfans page, the drafts queue and the portal, without a double slash", () => {
    assert.ok(out.html.includes('href="https://www.fanengagepro.com/fans/ada"'));
    assert.ok(out.html.includes('href="https://www.fanengagepro.com/artist-portal/superfans"'));
    assert.ok(out.html.includes('href="https://www.fanengagepro.com/artist-portal/community"'));
    assert.ok(out.text.includes("https://www.fanengagepro.com/artist-portal/brief"));
    assert.ok(!out.html.includes("com//"));
    assert.ok(out.html.includes('href="https://tickets.example/1"'));
  });

  it("shows tiers, the thank score and days since activity", () => {
    assert.ok(out.text.includes("Ada A (Gold) — 300 pts"));
    assert.ok(out.text.includes("Bo & Co (Silver) — score 13 · last active 3 days ago"));
    assert.ok(out.text.includes("2 AI post drafts waiting for review"));
  });

  it("has honest empty states", () => {
    const empty = renderTeamBrief(
      data({ topFans: [], superfansToThank: [], upcomingEvents: [], pendingDrafts: 0 }),
      "https://example.com",
    );
    assert.ok(empty.text.includes("No points were earned last week."));
    assert.ok(empty.text.includes("Nobody new"));
    assert.ok(empty.text.includes("Nothing scheduled."));
    assert.ok(!empty.text.includes("waiting for review"));
    assert.ok(!empty.html.includes("waiting for review"));
  });
});
