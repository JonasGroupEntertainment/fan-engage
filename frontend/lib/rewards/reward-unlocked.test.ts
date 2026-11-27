import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isQuietAwardSource,
  pickUnlockedReward,
  rewardUnlockedCopy,
  rewardUnlockedDedupRef,
} from "./reward-unlocked.ts";

const now = new Date("2026-11-27T12:00:00Z");
const rewards = [
  { id: "a", title: "Sticker", point_cost: 100 },
  { id: "b", title: "Voice Note", point_cost: 250 },
  { id: "c", title: "Shoutout", point_cost: 500 },
];

describe("pickUnlockedReward", () => {
  it("names the reward whose price was just crossed", () => {
    const picked = pickUnlockedReward({ balanceBefore: 90, balanceAfter: 110, rewards, now });
    assert.equal(picked?.id, "a");
  });

  it("names the most valuable one when several are crossed at once", () => {
    const picked = pickUnlockedReward({ balanceBefore: 50, balanceAfter: 300, rewards, now });
    assert.equal(picked?.id, "b");
  });

  it("counts landing exactly on the price", () => {
    assert.equal(pickUnlockedReward({ balanceBefore: 249, balanceAfter: 250, rewards, now })?.id, "b");
  });

  it("says nothing when no price was crossed", () => {
    assert.equal(pickUnlockedReward({ balanceBefore: 110, balanceAfter: 240, rewards, now }), null);
    assert.equal(pickUnlockedReward({ balanceBefore: 100, balanceAfter: 100, rewards, now }), null);
    assert.equal(pickUnlockedReward({ balanceBefore: 300, balanceAfter: 200, rewards, now }), null);
    assert.equal(pickUnlockedReward({ balanceBefore: Number.NaN, balanceAfter: 200, rewards, now }), null);
    assert.equal(pickUnlockedReward({ balanceBefore: 0, balanceAfter: 999, rewards: [], now }), null);
  });

  it("never names a reward the fan cannot claim", () => {
    const blocked = [
      { id: "p", title: "Premium", point_cost: 100, requires_tier: "premium" },
      { id: "s", title: "Sold out", point_cost: 100, stock: 0 },
      { id: "f", title: "Not open", point_cost: 100, drops_at: "2026-12-01T00:00:00Z" },
      { id: "e", title: "Closed", point_cost: 100, expires_at: "2026-11-01T00:00:00Z" },
      { id: "z", title: "Free", point_cost: 0 },
    ];
    assert.equal(pickUnlockedReward({ balanceBefore: -5, balanceAfter: 150, rewards: blocked, now }), null);
    const open = [...blocked, { id: "ok", title: "Open", point_cost: 100, stock: 3 }];
    assert.equal(pickUnlockedReward({ balanceBefore: 50, balanceAfter: 150, rewards: open, now })?.id, "ok");
  });
});

describe("wording and repeats", () => {
  it("names the reward plainly", () => {
    assert.equal(rewardUnlockedCopy("Voice Note").title, "You have enough points for Voice Note");
  });

  it("is one notice per reward per day", () => {
    assert.equal(rewardUnlockedDedupRef("b", now), "b:2026-11-27");
  });

  it("stays quiet for the signup bonus", () => {
    assert.equal(isQuietAwardSource("signup_bonus"), true);
    assert.equal(isQuietAwardSource("daily_checkin"), false);
  });
});

describe("wiring", () => {
  const award = readFileSync(new URL("../points/award.ts", import.meta.url), "utf8");
  const trigger = readFileSync(
    new URL("../notifications/triggers/reward-unlocked.ts", import.meta.url),
    "utf8",
  );

  it("the notice can never fail or change an award", () => {
    const hook = award.slice(award.indexOf("const written ="));
    assert.match(hook, /try \{[\s\S]*reward-unlocked[\s\S]*\} catch/);
    assert.match(hook, /return written;/);
  });

  it("goes to the inbox and push only, never a text", () => {
    assert.match(trigger, /channels: \["push"\]/);
    assert.match(trigger, /inbox: \{/);
    assert.doesNotMatch(trigger, /bypassSmsTierGate|bypassQuietHours/);
  });

  it("only names rewards the rewards page lists", () => {
    assert.match(trigger, /shouldListLaunchReward\(/);
  });
});
