import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compare, countWeeklyNumbers, isRealFan, type WeeklyNumbersInput } from "./count.ts";
import { recentWeeks } from "./weeks.ts";

// Friday 2026-11-27. Current week starts Mon 11-23; last week Mon 11-16; before that 11-09.
const now = new Date("2026-11-27T17:00:00Z");
const weeks = recentWeeks(now, 3);
const real = (id: string, email = `${id}@mail.test.invalid`) => ({
  id,
  is_internal: false,
  suspended: false,
  email,
});

const base: WeeklyNumbersInput = {
  weeks,
  fans: [
    real("a"),
    real("b"),
    real("c"),
    { id: "team", is_internal: true, suspended: false, email: "x@jonasgroup.com" },
    { id: "sus", is_internal: false, suspended: true, email: "s@mail.test.invalid" },
  ],
  memberships: [
    { fan_id: "a", joined_at: "2026-06-01T12:00:00Z" },
    { fan_id: "b", joined_at: "2026-11-17T15:00:00Z" },
    { fan_id: "c", joined_at: "2026-11-24T15:00:00Z" },
    { fan_id: "team", joined_at: "2026-11-24T15:00:00Z" },
    { fan_id: "sus", joined_at: "2026-11-17T15:00:00Z" },
  ],
  activity: [
    { fan_id: "a", source: "daily_checkin", created_at: "2026-11-18T15:00:00Z" },
    { fan_id: "a", source: "daily_drop", created_at: "2026-11-18T15:01:00Z" },
    { fan_id: "b", source: "daily_checkin", created_at: "2026-11-18T16:00:00Z" },
    { fan_id: "a", source: "daily_checkin", created_at: "2026-11-25T15:00:00Z" },
    { fan_id: "b", source: "badge", created_at: "2026-11-25T15:00:00Z" },
    { fan_id: "c", source: "daily_checkin", created_at: "2026-11-25T15:00:00Z" },
    { fan_id: "team", source: "daily_checkin", created_at: "2026-11-25T15:00:00Z" },
    { fan_id: "sus", source: "daily_checkin", created_at: "2026-11-25T15:00:00Z" },
    { fan_id: "ghost", source: "daily_checkin", created_at: "2026-11-25T15:00:00Z" },
  ],
  posts: [
    { author_id: "a", created_at: "2026-11-18T15:00:00Z" },
    { author_id: "team", created_at: "2026-11-18T15:00:00Z" },
  ],
  comments: [{ author_id: "b", created_at: "2026-11-25T15:00:00Z" }],
  rewardsClaimed: [{ fan_id: "a", created_at: "2026-11-25T15:00:00Z" }],
  friends: [
    { referred_id: "c", verified_at: "2026-11-24T15:05:00Z" },
    { referred_id: null, verified_at: "2026-11-24T15:05:00Z" },
  ],
};

describe("isRealFan", () => {
  it("leaves out team, test, suspended and unknown accounts", () => {
    assert.equal(isRealFan(real("a")), true);
    assert.equal(isRealFan(undefined), false);
    assert.equal(isRealFan({ id: "t", is_internal: true, suspended: false, email: null }), false);
    assert.equal(isRealFan({ id: "t", is_internal: null, suspended: false, email: null }), false);
    assert.equal(isRealFan({ id: "s", is_internal: false, suspended: true, email: null }), false);
    assert.equal(isRealFan(real("j", "Someone@JonasGroup.com")), false);
    assert.equal(isRealFan(real("e", "a@example.com")), false);
    assert.equal(isRealFan({ id: "n", is_internal: false, suspended: false, email: null }), true);
  });
});

describe("countWeeklyNumbers", () => {
  const result = countWeeklyNumbers(base);
  const [current, last, before] = result.rows;

  it("counts only real fans in the total", () => {
    assert.equal(result.totalFans, 3);
  });

  it("puts new fans in the week they joined", () => {
    assert.equal(current.newFans, 1);
    assert.equal(last.newFans, 1);
    assert.equal(before.newFans, 0);
  });

  it("counts active and returning fans", () => {
    assert.equal(current.activeFans, 3);
    // a and b were fans before this week began; c joined this week.
    assert.deepEqual(current.returning, { count: 2, share: 2 / 3 });
    assert.equal(last.activeFans, 2);
    // b joined last week, so only a is returning.
    assert.deepEqual(last.returning, { count: 1, share: 0.5 });
    assert.deepEqual(before.returning, { count: 0, share: null });
  });

  it("counts check-ins, drops, posts, comments, rewards and friends", () => {
    assert.equal(current.checkIns, 2);
    assert.equal(last.checkIns, 2);
    assert.equal(last.dropsClaimed, 1);
    assert.equal(last.posts, 1);
    assert.equal(current.comments, 1);
    assert.equal(current.rewardsClaimed, 1);
    assert.equal(current.friendsJoined, 1);
  });

  it("marks the current week as in progress and compares the two finished weeks", () => {
    assert.equal(current.week.inProgress, true);
    assert.equal(result.summary?.week.startDate, "2026-11-16");
    assert.equal(result.summary?.previousWeek.startDate, "2026-11-09");
    assert.deepEqual(result.summary?.lines[1], {
      label: "Active fans",
      comparison: { current: 2, previous: 0, change: 2, direction: "up" },
    });
  });

  it("shows a failed read as unknown, never as zero", () => {
    const noActivity = countWeeklyNumbers({ ...base, activity: null });
    assert.equal(noActivity.rows[0].activeFans, null);
    assert.equal(noActivity.rows[0].checkIns, null);
    assert.equal(noActivity.rows[0].returning, null);
    assert.equal(noActivity.rows[0].newFans, 1);
    assert.equal(noActivity.summary?.lines[1].comparison, null);

    const noFans = countWeeklyNumbers({ ...base, fans: null });
    assert.equal(noFans.totalFans, null);
    assert.equal(noFans.rows[0].newFans, null);
    assert.equal(noFans.rows[0].posts, null);

    const noPosts = countWeeklyNumbers({ ...base, posts: null });
    assert.equal(noPosts.rows[1].posts, null);
    assert.equal(noPosts.rows[1].checkIns, 2);
  });

  it("uses New York weeks: Sunday night there belongs to the week that is ending", () => {
    // Mon 2026-11-23 03:30 UTC is Sun 2026-11-22 22:30 in New York.
    const late = countWeeklyNumbers({
      ...base,
      activity: [{ fan_id: "a", source: "daily_checkin", created_at: "2026-11-23T03:30:00Z" }],
    });
    assert.equal(late.rows[0].checkIns, 0);
    assert.equal(late.rows[1].checkIns, 1);
  });
});

describe("compare", () => {
  it("gives the direction of change", () => {
    assert.equal(compare(3, 5)?.direction, "down");
    assert.equal(compare(5, 5)?.direction, "flat");
    assert.equal(compare(null, 5), null);
  });
});
