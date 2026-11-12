import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_TODAY_ITEMS,
  selectCheckinItem,
  selectEventItem,
  selectRewardItem,
  selectStreakItem,
  selectTodayItems,
  type TodayEvent,
  type TodayInput,
} from "./select.ts";

const TODAY = "2026-03-14";
const YESTERDAY = "2026-03-13";

function base(over: Partial<TodayInput> = {}): TodayInput {
  return {
    todayKey: TODAY,
    yesterdayKey: YESTERDAY,
    followedArtists: [{ slug: "raelynn", name: "RaeLynn" }],
    events: [],
    checkins: [],
    newPosts: { count: 0, capped: false, href: "/artists/raelynn/community" },
    streak: { currentStreakDays: 0, lastActiveDate: null, href: "/activity" },
    rewards: [],
    points: 0,
    premiumCommunities: [],
    founderCommunities: [],
    rewardsHref: "/rewards",
    ...over,
  };
}

function ev(over: Partial<TodayEvent> = {}): TodayEvent {
  return {
    id: "e1",
    artist_slug: "raelynn",
    title: "Austin show",
    dayKey: TODAY,
    starts_at: null,
    distanceMiles: null,
    nearYou: false,
    ...over,
  };
}

describe("selectCheckinItem", () => {
  it("skips when the fan has no venue reason to check in", () => {
    assert.equal(selectCheckinItem(base()), null);
  });

  it("offers check-in at an artist with an event today", () => {
    const item = selectCheckinItem(base({ events: [ev()] }));
    assert.equal(item?.href, "/artists/raelynn/checkin");
    assert.equal(item?.label, "Check in today");
    assert.equal(item?.hint, "RaeLynn");
  });

  it("offers check-in at an artist the fan has checked in at before", () => {
    const item = selectCheckinItem(
      base({ checkins: [{ artist_slug: "raelynn", dayKey: "2026-02-01" }] }),
    );
    assert.equal(item?.href, "/artists/raelynn/checkin");
  });

  it("hides once the fan checked in today at any followed artist", () => {
    const item = selectCheckinItem(
      base({ events: [ev()], checkins: [{ artist_slug: "raelynn", dayKey: TODAY }] }),
    );
    assert.equal(item, null);
  });

  it("ignores events from artists the fan does not follow", () => {
    assert.equal(selectCheckinItem(base({ events: [ev({ artist_slug: "bailee" })] })), null);
  });

  it("does not count an unparseable event date as today", () => {
    assert.equal(selectCheckinItem(base({ events: [ev({ dayKey: null })] })), null);
  });
});

describe("selectEventItem", () => {
  it("renders Tonight with the artist and distance", () => {
    const item = selectEventItem(base({ events: [ev({ distanceMiles: 42, nearYou: true })] }));
    assert.equal(item?.label, "Tonight: Austin show");
    assert.equal(item?.href, "/artists/raelynn");
    assert.equal(item?.hint, "RaeLynn · 42 mi");
  });

  it("omits distance when coordinates are missing", () => {
    const item = selectEventItem(base({ events: [ev()] }));
    assert.equal(item?.hint, "RaeLynn");
  });

  it("prefers a near event over a far one, then the closest", () => {
    const item = selectEventItem(
      base({
        events: [
          ev({ id: "far", title: "Far", distanceMiles: 600, nearYou: false }),
          ev({ id: "near", title: "Near", distanceMiles: 30, nearYou: true }),
          ev({ id: "nearer", title: "Nearer", distanceMiles: 12, nearYou: true }),
          ev({ id: "unknown", title: "Unknown" }),
        ],
      }),
    );
    assert.equal(item?.label, "Tonight: Nearer");
  });

  it("skips events not happening today", () => {
    assert.equal(selectEventItem(base({ events: [ev({ dayKey: "2026-03-15" })] })), null);
    assert.equal(selectEventItem(base({ events: [ev({ dayKey: null })] })), null);
  });
});

describe("selectStreakItem", () => {
  it("shows the check when active today", () => {
    const item = selectStreakItem(
      base({ streak: { currentStreakDays: 5, lastActiveDate: TODAY, href: "/activity" } }),
    );
    assert.equal(item?.label, "Day 5 ✓");
  });
  it("nudges when last active yesterday", () => {
    const item = selectStreakItem(
      base({ streak: { currentStreakDays: 5, lastActiveDate: YESTERDAY, href: "/activity" } }),
    );
    assert.equal(item?.label, "Day 5 — keep it going");
  });
  it("reads the streak on the UTC calendar, not the Eastern one (8 PM–midnight ET)", () => {
    // 2026-03-14 20:30 ET is 2026-03-15 00:30 UTC. touch.ts has stamped
    // today's visit as the UTC day, 2026-03-15; the Eastern key is still
    // the 14th. The chip must say "Day 5 ✓", not "keep it going".
    const utcEvening = base({
      todayKey: "2026-03-14",
      yesterdayKey: "2026-03-13",
      streakTodayKey: "2026-03-15",
      streakYesterdayKey: "2026-03-14",
      streak: { currentStreakDays: 5, lastActiveDate: "2026-03-15", href: "/activity" },
    });
    assert.equal(selectStreakItem(utcEvening)?.label, "Day 5 ✓");
    // A fan last counted on UTC 03-14 (Eastern "today") is really one day behind.
    assert.equal(
      selectStreakItem({
        ...utcEvening,
        streak: { currentStreakDays: 5, lastActiveDate: "2026-03-14", href: "/activity" },
      })?.label,
      "Day 5 — keep it going",
    );
    // Without the streak keys the Eastern keys still apply (older callers).
    assert.equal(
      selectStreakItem(base({ streak: { currentStreakDays: 2, lastActiveDate: TODAY, href: "/a" } }))?.label,
      "Day 2 ✓",
    );
  });
  it("hides for a lapsed or zero streak", () => {
    assert.equal(
      selectStreakItem(
        base({ streak: { currentStreakDays: 5, lastActiveDate: "2026-03-10", href: "/a" } }),
      ),
      null,
    );
    assert.equal(
      selectStreakItem(base({ streak: { currentStreakDays: 0, lastActiveDate: TODAY, href: "/a" } })),
      null,
    );
  });
});

describe("selectRewardItem", () => {
  const reward = (over: Partial<TodayInput["rewards"][number]> = {}) => ({
    id: "r1",
    title: "Phone Wallpaper",
    point_cost: 100,
    community_id: "raelynn",
    requires_tier: null,
    redeemed: false,
    ...over,
  });

  it("picks the priciest affordable, unredeemed reward", () => {
    const item = selectRewardItem(
      base({
        points: 500,
        rewards: [
          reward({ id: "a", title: "Cheap", point_cost: 100 }),
          reward({ id: "b", title: "Pricey", point_cost: 400 }),
          reward({ id: "c", title: "Too much", point_cost: 900 }),
          reward({ id: "d", title: "Done", point_cost: 450, redeemed: true }),
        ],
      }),
    );
    assert.equal(item?.label, "Unclaimed: Pricey");
    assert.equal(item?.href, "/artists/raelynn/rewards");
    assert.equal(item?.hint, "400 pts");
  });

  it("respects tier gates", () => {
    const gated = reward({ requires_tier: "premium" });
    assert.equal(selectRewardItem(base({ points: 500, rewards: [gated] })), null);
    assert.equal(
      selectRewardItem(base({ points: 500, rewards: [gated], premiumCommunities: ["raelynn"] }))
        ?.kind,
      "reward",
    );
  });

  it("uses the global rewards page for community-less rewards", () => {
    const item = selectRewardItem(base({ points: 500, rewards: [reward({ community_id: null })] }));
    assert.equal(item?.href, "/rewards");
  });
});

describe("selectTodayItems", () => {
  it("returns nothing when there is nothing to do", () => {
    assert.deepEqual(selectTodayItems(base()), []);
  });

  it("orders checkin, event, posts, streak, reward and caps at four", () => {
    const items = selectTodayItems(
      base({
        events: [ev()],
        newPosts: { count: 5, capped: true, href: "/artists/raelynn/community" },
        streak: { currentStreakDays: 3, lastActiveDate: TODAY, href: "/activity" },
        points: 1000,
        rewards: [
          { id: "r", title: "Sticker", point_cost: 50, community_id: null, requires_tier: null, redeemed: false },
        ],
      }),
    );
    assert.equal(items.length, MAX_TODAY_ITEMS);
    assert.deepEqual(
      items.map((i) => i.kind),
      ["checkin", "event", "posts", "streak"],
    );
    assert.equal(items[2].label, "5+ new posts");
  });

  it("singularises one post", () => {
    const items = selectTodayItems(
      base({ newPosts: { count: 1, capped: false, href: "/x" } }),
    );
    assert.equal(items[0].label, "1 new post");
  });
});
