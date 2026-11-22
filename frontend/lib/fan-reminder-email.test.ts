import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REMINDER_EMAIL_CAP_DAYS,
  buildOvertakenEmail,
  buildStreakReminderEmail,
  isFanReminderEmailEnabled,
  reminderEmailBlockReason,
  reminderEmailCapCutoffIso,
  type ReminderEmailFan,
} from "./fan-reminder-email.ts";

const APP_URL = "https://www.fanengagepro.com/";
const RAELYNN = { slug: "raelynn", name: "RaeLynn" };
const EM_DASH = new RegExp(String.fromCharCode(0x2014));
const CORPORATE = /we miss you|we noticed|valued|don't miss out|exciting/i;

const FAN: ReminderEmailFan = {
  id: "fan-1",
  email: "mia@example.com",
  first_name: "Mia",
  email_opted_in: true,
  suspended: false,
  is_internal: false,
  unsubscribe_token: "unsub-1",
};

describe("isFanReminderEmailEnabled", () => {
  it("is off unless the flag is exactly 1", () => {
    assert.equal(isFanReminderEmailEnabled({}), false);
    assert.equal(isFanReminderEmailEnabled({ FAN_REMINDER_EMAIL_ENABLED: "" }), false);
    assert.equal(isFanReminderEmailEnabled({ FAN_REMINDER_EMAIL_ENABLED: "0" }), false);
    assert.equal(isFanReminderEmailEnabled({ FAN_REMINDER_EMAIL_ENABLED: "true" }), false);
    assert.equal(isFanReminderEmailEnabled({ FAN_REMINDER_EMAIL_ENABLED: "1" }), true);
    assert.equal(isFanReminderEmailEnabled({ FAN_REMINDER_EMAIL_ENABLED: " 1 " }), true);
  });
});

describe("reminderEmailBlockReason", () => {
  it("allows an opted-in fan with an address and an unsubscribe link", () => {
    assert.equal(reminderEmailBlockReason(FAN), null);
  });

  it("names the first gate that fails", () => {
    assert.equal(reminderEmailBlockReason(null), "fan_not_found");
    assert.equal(reminderEmailBlockReason({ ...FAN, email_opted_in: false }), "not_opted_in");
    assert.equal(reminderEmailBlockReason({ ...FAN, email_opted_in: null }), "not_opted_in");
    assert.equal(reminderEmailBlockReason({ ...FAN, suspended: true }), "suspended");
    assert.equal(reminderEmailBlockReason({ ...FAN, suspended: null }), "suspended");
    assert.equal(reminderEmailBlockReason({ ...FAN, is_internal: true }), "internal");
    assert.equal(reminderEmailBlockReason({ ...FAN, email: "  " }), "no_address");
    assert.equal(reminderEmailBlockReason({ ...FAN, unsubscribe_token: null }), "no_unsubscribe_link");
  });
});

describe("reminderEmailCapCutoffIso", () => {
  it("looks back a rolling seven days", () => {
    assert.equal(REMINDER_EMAIL_CAP_DAYS, 7);
    assert.equal(
      reminderEmailCapCutoffIso(new Date("2026-11-22T21:00:00Z")),
      "2026-11-15T21:00:00.000Z",
    );
  });
});

describe("buildStreakReminderEmail", () => {
  const email = buildStreakReminderEmail({
    firstName: "Mia",
    streakDays: 7,
    endsAtLocal: "tonight at 6 PM",
    artist: RAELYNN,
    appUrl: APP_URL,
    unsubscribeToken: "unsub 1",
  });

  it("reads as written", () => {
    assert.equal(email.subject, "Your 7-day streak ends tonight at 6 PM");
    assert.equal(
      email.text,
      [
        "Hi Mia,",
        "Your 7-day streak ends tonight at 6 PM.",
        "One visit keeps it going. Open RaeLynn's page before then, signed in, and today counts. You do not need to post or react.",
        "Keep my streak: https://www.fanengagepro.com/artists/raelynn",
        "You are getting this because email is on for your Fan Engage account. To stop only streak reminders, change your notification settings: https://www.fanengagepro.com/me/notifications",
        "To stop all Fan Engage emails, unsubscribe: https://www.fanengagepro.com/unsubscribe?token=unsub%201",
        "Fan Engage",
      ].join("\n\n"),
    );
  });

  it("has one button, to the artist page that keeps the streak", () => {
    assert.equal(email.url, "https://www.fanengagepro.com/artists/raelynn");
    assert.equal(email.html.match(/border-radius:8px/g)?.length, 1);
    assert.ok(email.html.includes('href="https://www.fanengagepro.com/artists/raelynn"'));
    assert.ok(email.html.includes("/unsubscribe?token=unsub%201"));
    assert.ok(email.html.includes("RaeLynn&#39;s page"));
  });

  it("points at Fan Home when the fan has no artist", () => {
    const noArtist = buildStreakReminderEmail({
      firstName: null,
      streakDays: 3,
      endsAtLocal: "at midnight",
      artist: null,
      appUrl: APP_URL,
      unsubscribeToken: "t",
    });
    assert.ok(noArtist.text.startsWith("Hi,\n\nYour 3-day streak ends at midnight."));
    assert.ok(noArtist.text.includes("Open your Fan Home before then"));
    assert.equal(noArtist.url, "https://www.fanengagepro.com/");
  });

  it("escapes a first name and keeps it short", () => {
    const odd = buildStreakReminderEmail({
      firstName: `<b>${"x".repeat(60)}`,
      streakDays: 5,
      endsAtLocal: "tonight at 7 PM",
      artist: RAELYNN,
      appUrl: APP_URL,
      unsubscribeToken: "t",
    });
    assert.ok(odd.html.includes("Hi &lt;b&gt;"));
    assert.equal(odd.html.includes("<b>"), false);
    assert.ok(odd.text.split("\n")[0].length <= "Hi ,".length + 40);
  });
});

describe("buildOvertakenEmail", () => {
  const email = buildOvertakenEmail({
    firstName: "Mia",
    artist: RAELYNN,
    newRank: 4,
    previousRank: 3,
    appUrl: APP_URL,
    unsubscribeToken: "unsub-1",
  });

  it("reads as written", () => {
    assert.equal(email.subject, "You dropped to #4 on RaeLynn's leaderboard");
    assert.equal(
      email.text,
      [
        "Hi Mia,",
        "Someone passed you on RaeLynn's leaderboard. You were #3 yesterday and you are #4 today.",
        "The board runs to the end of the month. Check-ins, RSVPs, shares, posts, comments and reactions all add to your score.",
        "See the leaderboard: https://www.fanengagepro.com/artists/raelynn/leaderboard",
        "You are getting this because email is on for your Fan Engage account. To stop only leaderboard movement, change your notification settings: https://www.fanengagepro.com/me/notifications",
        "To stop all Fan Engage emails, unsubscribe: https://www.fanengagepro.com/unsubscribe?token=unsub-1",
        "Fan Engage",
      ].join("\n\n"),
    );
    assert.equal(email.url, "https://www.fanengagepro.com/artists/raelynn/leaderboard");
  });

  it("has no em dashes or corporate lines in either email", () => {
    const streak = buildStreakReminderEmail({
      firstName: "Mia",
      streakDays: 7,
      endsAtLocal: "tonight at 6 PM",
      artist: RAELYNN,
      appUrl: APP_URL,
      unsubscribeToken: "t",
    });
    for (const body of [email.text, email.html, streak.text, streak.html]) {
      assert.doesNotMatch(body, EM_DASH);
      assert.doesNotMatch(body, CORPORATE);
    }
  });
});
