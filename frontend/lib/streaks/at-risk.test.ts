import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AT_RISK_MIN_STREAK,
  DEFAULT_TIMEZONE,
  SEND_UTC_HOUR,
  formatClock,
  isSendHourUtc,
  isStreakAtRisk,
  isValidTimeZone,
  localClock,
  nextUtcMidnight,
  resolveTimeZone,
  selectAtRiskFans,
  sentTodayIds,
  streakAtRiskCopy,
  streakEndsAtLocal,
  utcYesterdayString,
} from "./at-risk.ts";

// The send hour on two calendars: 2026-10-29 (US daylight time) and
// 2026-11-05 (after the 2026-11-01 fall-back).
const SEND_DST = new Date("2026-10-29T21:00:00Z");
const SEND_STD = new Date("2026-11-05T21:00:00Z");

describe("time zone helpers", () => {
  it("validates and resolves zones", () => {
    assert.equal(isValidTimeZone("America/Chicago"), true);
    assert.equal(isValidTimeZone("Not/AZone"), false);
    assert.equal(isValidTimeZone(null), false);
    assert.equal(resolveTimeZone("Europe/London"), "Europe/London");
    assert.equal(resolveTimeZone("garbage"), DEFAULT_TIMEZONE);
    assert.equal(resolveTimeZone(undefined), DEFAULT_TIMEZONE);
  });

  it("uses the UTC calendar for yesterday and the rollover", () => {
    assert.equal(utcYesterdayString(SEND_DST), "2026-10-28");
    assert.equal(utcYesterdayString(new Date("2026-10-30T00:30:00Z")), "2026-10-29");
    assert.equal(nextUtcMidnight(SEND_DST).toISOString(), "2026-10-30T00:00:00.000Z");
    assert.equal(nextUtcMidnight(new Date("2026-10-29T00:00:00Z")).toISOString(), "2026-10-30T00:00:00.000Z");
  });

  it("formats a local clock the way a push reads", () => {
    assert.equal(formatClock({ hour: 19, minute: 0 }), "7 PM");
    assert.equal(formatClock({ hour: 18, minute: 30 }), "6:30 PM");
    assert.equal(formatClock({ hour: 0, minute: 0 }), "12 AM");
    assert.equal(formatClock({ hour: 12, minute: 5 }), "12:05 PM");
    assert.deepEqual(localClock("Asia/Kolkata", nextUtcMidnight(SEND_DST)), { hour: 5, minute: 30 });
  });
});

describe("send hour", () => {
  it("is the 21:00 UTC hour only — the cron no-ops the other 23", () => {
    assert.equal(SEND_UTC_HOUR, 21);
    assert.equal(isSendHourUtc(SEND_DST), true);
    assert.equal(isSendHourUtc(new Date("2026-10-29T21:59:59Z")), true);
    assert.equal(isSendHourUtc(new Date("2026-10-29T22:00:00Z")), false);
    assert.equal(isSendHourUtc(new Date("2026-10-29T20:59:59Z")), false);
  });
});

describe("streakEndsAtLocal — the fan's wall-clock time of 00:00 UTC", () => {
  it("America/Chicago: 7 PM in CDT, 6 PM in CST", () => {
    assert.equal(streakEndsAtLocal("America/Chicago", SEND_DST), "tonight at 7 PM");
    assert.equal(streakEndsAtLocal("America/Chicago", SEND_STD), "tonight at 6 PM");
  });

  it("America/New_York: 8 PM in EDT, 7 PM in EST", () => {
    assert.equal(streakEndsAtLocal("America/New_York", SEND_DST), "tonight at 8 PM");
    assert.equal(streakEndsAtLocal("America/New_York", SEND_STD), "tonight at 7 PM");
  });

  it("America/Los_Angeles: 5 PM in PDT, 4 PM in PST", () => {
    assert.equal(streakEndsAtLocal("America/Los_Angeles", SEND_DST), "tonight at 5 PM");
    assert.equal(streakEndsAtLocal("America/Los_Angeles", SEND_STD), "tonight at 4 PM");
  });

  it("non-US zones say when the UTC rollover lands on their clock", () => {
    assert.equal(streakEndsAtLocal("Europe/London", SEND_DST), "at midnight");
    assert.equal(streakEndsAtLocal("Europe/London", SEND_STD), "at midnight");
    assert.equal(streakEndsAtLocal("Europe/Paris", SEND_DST), "tonight at 1 AM");
    // 21:00 UTC is already 02:30 the next day in Kolkata; the rollover is 05:30 that day.
    assert.equal(streakEndsAtLocal("Asia/Kolkata", SEND_DST), "today at 5:30 AM");
    // 21:00 UTC is 06:00 in Tokyo; the rollover is 09:00 the same local day.
    assert.equal(streakEndsAtLocal("Asia/Tokyo", SEND_DST), "today at 9 AM");
    // Invalid zone falls back to the default.
    assert.equal(streakEndsAtLocal("Nope/Nope", SEND_DST), "tonight at 7 PM");
    // Exactly at the rollover the next one is a day away.
    assert.equal(streakEndsAtLocal("America/Chicago", new Date("2026-10-30T00:00:00Z")), "tomorrow at 7 PM");
  });
});

describe("isStreakAtRisk", () => {
  it("needs a streak of at least 3 and last_active_date = UTC yesterday", () => {
    const now = SEND_DST;
    assert.equal(isStreakAtRisk({ now, currentStreakDays: 12, lastActiveDate: "2026-10-28" }), true);
    assert.equal(isStreakAtRisk({ now, currentStreakDays: AT_RISK_MIN_STREAK, lastActiveDate: "2026-10-28" }), true);
    assert.equal(isStreakAtRisk({ now, currentStreakDays: 2, lastActiveDate: "2026-10-28" }), false);
    // Already counted today (UTC): safe.
    assert.equal(isStreakAtRisk({ now, currentStreakDays: 12, lastActiveDate: "2026-10-29" }), false);
    // Already lapsed: nothing to save.
    assert.equal(isStreakAtRisk({ now, currentStreakDays: 12, lastActiveDate: "2026-10-27" }), false);
    assert.equal(isStreakAtRisk({ now, currentStreakDays: 12, lastActiveDate: null }), false);
    assert.equal(isStreakAtRisk({ now, currentStreakDays: null, lastActiveDate: "2026-10-28" }), false);
  });

  it("ignores the fan's timezone — the streak calendar is UTC (touch.ts)", () => {
    // 01:00 UTC on the 30th: a last_active_date of the 29th is "today" in
    // UTC terms (safe) even though it is still the 29th in Chicago.
    // The UTC day has rolled: the 29th is now "yesterday" for everyone.
    const now = new Date("2026-10-30T01:00:00Z");
    assert.equal(isStreakAtRisk({ now, currentStreakDays: 5, lastActiveDate: "2026-10-29" }), true);
    assert.equal(isStreakAtRisk({ now, currentStreakDays: 5, lastActiveDate: "2026-10-28" }), false);
  });
});

describe("selectAtRiskFans", () => {
  const rows = [
    { id: "chi", email: "a@x.com", current_streak_days: 12, last_active_date: "2026-10-28", timezone: "America/Chicago" },
    { id: "chi-safe", email: null, current_streak_days: 12, last_active_date: "2026-10-29", timezone: "America/Chicago" },
    { id: "chi-short", email: null, current_streak_days: 1, last_active_date: "2026-10-28", timezone: "America/Chicago" },
    { id: "nyc", email: null, current_streak_days: 9, last_active_date: "2026-10-28", timezone: "America/New_York" },
    { id: "la", email: null, current_streak_days: 4, last_active_date: "2026-10-28", timezone: "America/Los_Angeles" },
    { id: "default-tz", email: "d@x.com", current_streak_days: 4, last_active_date: "2026-10-28", timezone: null },
    { id: "bad-tz", email: null, current_streak_days: 4, last_active_date: "2026-10-28", timezone: "Nope/Nope" },
    { id: "tokyo", email: null, current_streak_days: 4, last_active_date: "2026-10-28", timezone: "Asia/Tokyo" },
    { id: "", current_streak_days: 4, last_active_date: "2026-10-28", timezone: "America/Chicago" },
    { id: "london", email: null, current_streak_days: 3, last_active_date: "2026-10-28", timezone: "Europe/London" },
  ];

  it("at 21:00 UTC in daylight time: picks UTC-yesterday streaks with honest local times", () => {
    const out = selectAtRiskFans(rows, SEND_DST);
    assert.deepEqual(
      out.map((f) => [f.id, f.endsAtLocal]),
      [
        ["chi", "tonight at 7 PM"],
        ["nyc", "tonight at 8 PM"],
        ["la", "tonight at 5 PM"],
        ["default-tz", "tonight at 7 PM"],
        ["bad-tz", "tonight at 7 PM"],
        ["tokyo", "today at 9 AM"],
        ["london", "at midnight"],
      ],
    );
    assert.equal(out[0].currentStreakDays, 12);
    assert.equal(out[3].timezone, DEFAULT_TIMEZONE);
    assert.equal(out[3].email, "d@x.com");
    assert.equal(out[5].timezone, "Asia/Tokyo");
  });

  it("after the fall-back, the same zones read an hour earlier", () => {
    const shifted = rows.map((r) => ({ ...r, last_active_date: r.last_active_date === "2026-10-28" ? "2026-11-04" : "2026-11-05" }));
    const out = selectAtRiskFans(shifted, SEND_STD);
    assert.deepEqual(
      out.map((f) => [f.id, f.endsAtLocal]),
      [
        ["chi", "tonight at 6 PM"],
        ["nyc", "tonight at 7 PM"],
        ["la", "tonight at 4 PM"],
        ["default-tz", "tonight at 6 PM"],
        ["bad-tz", "tonight at 6 PM"],
        ["tokyo", "today at 9 AM"],
        ["london", "at midnight"],
      ],
    );
  });

  it("selects nobody outside the send hour, even for at-risk fans", () => {
    assert.deepEqual(selectAtRiskFans(rows, new Date("2026-10-29T20:00:00Z")), []);
    assert.deepEqual(selectAtRiskFans(rows, new Date("2026-10-29T23:00:00Z")), []);
  });
});

describe("streakAtRiskCopy", () => {
  it("names the streak length and the fan's local rollover time", () => {
    assert.deepEqual(streakAtRiskCopy(12, "tonight at 7 PM"), {
      title: "Your 12-day streak ends tonight at 7 PM",
      body: "Open Fan Engage and do one thing — a reaction counts.",
      url: "/",
    });
    assert.equal(streakAtRiskCopy(5, "tonight at 4 PM").title, "Your 5-day streak ends tonight at 4 PM");
    assert.equal(streakAtRiskCopy(3, "at midnight").title, "Your 3-day streak ends at midnight");
  });
});

describe("sentTodayIds", () => {
  it("dedups on the UTC calendar day, any status", () => {
    const now = new Date("2026-10-29T21:30:00Z");
    const ids = sentTodayIds(
      [
        { fan_id: "today", sent_at: "2026-10-29T21:05:00Z" },
        { fan_id: "today-early", sent_at: "2026-10-29T00:30:00Z" },
        { fan_id: "yesterday", sent_at: "2026-10-28T23:59:00Z" },
        { fan_id: "bad", sent_at: "nope" },
        { fan_id: "", sent_at: "2026-10-29T21:00:00Z" },
      ],
      now,
    );
    assert.deepEqual([...ids].sort(), ["today", "today-early"]);
  });
});
