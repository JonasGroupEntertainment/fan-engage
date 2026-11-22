import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INBOX_REMINDER_PRIORITY,
  MAX_INBOX_REMINDERS_PER_FAN_PER_DAY,
  buildInboxRow,
  inboxBlockReason,
  inboxCapDecision,
  inboxDay,
  inboxDayStartIso,
  inboxDedupKey,
  inboxMonth,
  inboxReminderLabel,
  isInboxReminderKind,
  isReminderDedupKey,
  mirrorReminderToInbox,
  type InboxMirror,
  type InboxMirrorDeps,
  type InboxRow,
  type TodaysReminder,
} from "./inbox-mirror.ts";
import type { NotificationPreferences } from "./types.ts";

const NOW = new Date("2026-11-22T21:05:00Z");

const PREFS: NotificationPreferences = {
  fan_id: "fan-1",
  push_enabled: false,
  sms_enabled: false,
  notify_new_post: true,
  notify_event_match: true,
  notify_comment_on_my_post: true,
  notify_redemption: true,
  notify_drops: true,
  notify_rsvp_confirmation: true,
  notify_leaderboard: true,
  notify_streak: true,
  quiet_start: null,
  quiet_end: null,
  timezone: "America/Chicago",
};

const ACTIVE_FAN = { suspended: false, is_internal: false };

const STREAK_MIRROR: InboxMirror = {
  kind: "streak_at_risk",
  dedupKey: inboxDedupKey("streak_at_risk", "2026-11-22"),
  body: "Inbox wording",
  url: "/",
  communityId: null,
};

function todays(...kinds: string[]): TodaysReminder[] {
  return kinds.map((kind, i) => ({
    id: `row-${i}`,
    kind,
    dedup_key: `reminder:${kind}:x${i}`,
    read_at: null,
  }));
}

function fakeDeps(overrides: Partial<InboxMirrorDeps> = {}): {
  deps: InboxMirrorDeps;
  inserted: InboxRow[];
  removed: string[];
} {
  const inserted: InboxRow[] = [];
  const removed: string[] = [];
  const deps: InboxMirrorDeps = {
    loadFan: async () => ACTIVE_FAN,
    loadTodaysReminders: async () => [],
    insert: async (row) => {
      inserted.push(row);
      return "inserted";
    },
    remove: async (id) => {
      removed.push(id);
    },
    ...overrides,
  };
  return { deps, inserted, removed };
}

function run(deps: InboxMirrorDeps, mirror: InboxMirror = STREAK_MIRROR, prefs = PREFS) {
  return mirrorReminderToInbox(deps, {
    fanId: "fan-1",
    type: "streak_at_risk",
    prefs,
    mirror,
    title: "Your 7-day streak ends tonight at 6 PM",
    pushBody: "Push wording",
    pushUrl: "/push",
    now: NOW,
  });
}

describe("inbox dedup keys and periods", () => {
  it("builds one key per kind and period", () => {
    assert.equal(inboxDedupKey("streak_at_risk", "2026-11-22"), "reminder:streak_at_risk:2026-11-22");
    assert.equal(
      inboxDedupKey("anniversary", "raelynn", 0.5),
      "reminder:anniversary:raelynn:0.5",
    );
  });

  it("uses the UTC day and month", () => {
    assert.equal(inboxDay(new Date("2026-11-22T23:59:59Z")), "2026-11-22");
    assert.equal(inboxMonth(new Date("2026-11-30T23:59:59Z")), "2026-11");
    assert.equal(inboxDayStartIso(NOW), "2026-11-22T00:00:00.000Z");
  });

  it("labels its own kinds and leaves the rest alone", () => {
    assert.equal(inboxReminderLabel("streak_at_risk"), "Streak");
    assert.equal(inboxReminderLabel("leaderboard_overtaken"), "Leaderboard");
    assert.equal(inboxReminderLabel("badge_earned"), null);
  });
});

describe("reminder rows only", () => {
  it("does not treat an object prototype key as a reminder kind", () => {
    for (const kind of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      assert.equal(isInboxReminderKind(kind), false);
      assert.equal(inboxReminderLabel(kind), null);
    }
    assert.equal(isInboxReminderKind("streak_at_risk"), true);
  });

  it("knows its own dedup keys", () => {
    assert.equal(isReminderDedupKey(inboxDedupKey("new_post", "p1")), true);
    assert.equal(isReminderDedupKey("redemption:abc"), false);
    assert.equal(isReminderDedupKey("reminders:x"), false);
    assert.equal(isReminderDedupKey(null), false);
  });

  it("never counts or evicts a row whose key is not a reminder key", () => {
    const foreign = [
      { id: "a", kind: "new_post", dedup_key: "campaign:1", read_at: null },
      { id: "b", kind: "new_post", dedup_key: null, read_at: null },
      { id: "c", kind: "new_post", dedup_key: "badge:x", read_at: null },
    ];
    assert.deepEqual(inboxCapDecision("streak_at_risk", foreign), { action: "write" });
    const mixed = [...foreign, ...todays("new_post", "anniversary", "drop_launched")];
    assert.deepEqual(inboxCapDecision("streak_at_risk", mixed), { action: "replace", evictId: "row-0" });
  });
});

describe("inboxBlockReason", () => {
  it("allows a fan with push off", () => {
    assert.equal(inboxBlockReason({ fan: ACTIVE_FAN, prefs: PREFS, type: "streak_at_risk" }), null);
  });

  it("blocks suspended, internal and unknown fans", () => {
    const check = (fan: { suspended: boolean | null; is_internal: boolean | null } | null) =>
      inboxBlockReason({ fan, prefs: PREFS, type: "leaderboard" });
    assert.equal(check(null), "fan_not_found");
    assert.equal(check({ suspended: true, is_internal: false }), "suspended");
    assert.equal(check({ suspended: null, is_internal: false }), "suspended");
    assert.equal(check({ suspended: false, is_internal: true }), "internal");
    assert.equal(check({ suspended: false, is_internal: null }), "internal");
  });

  it("respects a notice type the fan turned off", () => {
    const prefs = { ...PREFS, notify_streak: false };
    assert.equal(
      inboxBlockReason({ fan: ACTIVE_FAN, prefs, type: "streak_at_risk" }),
      "type_opted_out",
    );
    assert.equal(inboxBlockReason({ fan: ACTIVE_FAN, prefs, type: "leaderboard" }), null);
  });

  it("treats a preference column that is missing as on", () => {
    const { notify_streak: _dropped, ...rest } = PREFS;
    void _dropped;
    assert.equal(
      inboxBlockReason({
        fan: ACTIVE_FAN,
        prefs: rest as NotificationPreferences,
        type: "streak_at_risk",
      }),
      null,
    );
  });
});

describe("inboxCapDecision", () => {
  it("writes while the day is under the cap", () => {
    assert.equal(MAX_INBOX_REMINDERS_PER_FAN_PER_DAY, 3);
    assert.deepEqual(inboxCapDecision("new_post", todays("new_post", "anniversary")), {
      action: "write",
    });
  });

  it("drops a less important reminder when the day is full", () => {
    const full = todays("streak_at_risk", "drop_expiring", "leaderboard_overtaken");
    assert.deepEqual(inboxCapDecision("new_post", full), { action: "skip" });
  });

  it("replaces the least important unread reminder with a more important one", () => {
    const full = todays("new_post", "anniversary", "drop_launched");
    assert.deepEqual(inboxCapDecision("streak_at_risk", full), {
      action: "replace",
      evictId: "row-0",
    });
  });

  it("never takes away a reminder the fan already read", () => {
    const full = todays("new_post", "anniversary", "drop_launched").map((row) => ({
      ...row,
      read_at: "2026-11-22T10:00:00Z",
    }));
    assert.deepEqual(inboxCapDecision("streak_at_risk", full), { action: "skip" });
  });

  it("does not replace a reminder of the same rank", () => {
    const full = todays("new_post", "new_post", "new_post");
    assert.deepEqual(inboxCapDecision("new_post", full), { action: "skip" });
  });

  it("never counts or drops redemption news", () => {
    const full = todays("streak_at_risk", "drop_expiring", "leaderboard_overtaken");
    assert.deepEqual(inboxCapDecision("redemption_update", full), { action: "write" });
    const withRedemptions = todays("redemption_update", "redemption_update", "redemption_update");
    assert.deepEqual(inboxCapDecision("new_post", withRedemptions), { action: "write" });
  });

  it("ranks the streak first and a new post last", () => {
    assert.equal(INBOX_REMINDER_PRIORITY[0], "streak_at_risk");
    assert.equal(INBOX_REMINDER_PRIORITY.at(-1), "new_post");
  });
});

describe("buildInboxRow", () => {
  it("keeps the push title and prefers the inbox body and url", () => {
    const row = buildInboxRow({
      fanId: "fan-1",
      mirror: STREAK_MIRROR,
      title: "Title",
      pushBody: "Push wording",
      pushUrl: "/push",
    });
    assert.deepEqual(row, {
      fan_id: "fan-1",
      kind: "streak_at_risk",
      title: "Title",
      body: "Inbox wording",
      url: "/",
      icon: "🔥",
      dedup_key: "reminder:streak_at_risk:2026-11-22",
    });
  });

  it("falls back to the push body and url and carries the community", () => {
    const row = buildInboxRow({
      fanId: "fan-1",
      mirror: { kind: "drop_launched", dedupKey: "reminder:drop_launched:r1", communityId: "raelynn" },
      title: "Title",
      pushBody: "Push wording",
      pushUrl: "/push",
    });
    assert.equal(row.body, "Push wording");
    assert.equal(row.url, "/push");
    assert.equal(row.community_id, "raelynn");
  });
});

describe("mirrorReminderToInbox", () => {
  it("writes one row for a fan with push off", async () => {
    const { deps, inserted, removed } = fakeDeps();
    assert.deepEqual(await run(deps), { status: "written", replacedId: null });
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].title, "Your 7-day streak ends tonight at 6 PM");
    assert.equal(inserted[0].body, "Inbox wording");
    assert.equal("community_id" in inserted[0], false);
    assert.deepEqual(removed, []);
  });

  it("writes nothing for a suspended fan and does not read further", async () => {
    let reads = 0;
    const { deps, inserted } = fakeDeps({
      loadFan: async () => ({ suspended: true, is_internal: false }),
      loadTodaysReminders: async () => {
        reads += 1;
        return [];
      },
    });
    assert.deepEqual(await run(deps), { status: "suppressed", reason: "suspended" });
    assert.equal(inserted.length, 0);
    assert.equal(reads, 0);
  });

  it("writes nothing when the fan turned streak reminders off", async () => {
    const { deps, inserted } = fakeDeps();
    const result = await run(deps, STREAK_MIRROR, { ...PREFS, notify_streak: false });
    assert.deepEqual(result, { status: "suppressed", reason: "type_opted_out" });
    assert.equal(inserted.length, 0);
  });

  it("does not stack a second row when the cron runs again", async () => {
    const { deps, inserted } = fakeDeps({
      loadTodaysReminders: async () => [
        { id: "row-0", kind: "streak_at_risk", dedup_key: STREAK_MIRROR.dedupKey, read_at: null },
      ],
    });
    assert.deepEqual(await run(deps), { status: "duplicate" });
    assert.equal(inserted.length, 0);
  });

  it("treats a unique violation at insert as a duplicate", async () => {
    const { deps, removed } = fakeDeps({
      loadTodaysReminders: async () => todays("new_post", "new_post", "new_post"),
      insert: async () => "duplicate",
    });
    assert.deepEqual(await run(deps), { status: "duplicate" });
    assert.deepEqual(removed, []);
  });

  it("replaces the least important unread row when the day is full", async () => {
    const { deps, inserted, removed } = fakeDeps({
      loadTodaysReminders: async () => todays("anniversary", "new_post", "drop_launched"),
    });
    assert.deepEqual(await run(deps), { status: "written", replacedId: "row-1" });
    assert.equal(inserted.length, 1);
    assert.deepEqual(removed, ["row-1"]);
  });

  it("drops a low priority reminder when the day is full", async () => {
    const { deps, inserted } = fakeDeps({
      loadTodaysReminders: async () => todays("streak_at_risk", "drop_expiring", "leaderboard_overtaken"),
    });
    const mirror: InboxMirror = { kind: "new_post", dedupKey: "reminder:new_post:p1", communityId: "raelynn" };
    assert.deepEqual(await run(deps, mirror), { status: "suppressed", reason: "daily_cap" });
    assert.equal(inserted.length, 0);
  });

  it("returns a failure instead of throwing", async () => {
    const { deps } = fakeDeps({
      insert: async () => {
        throw new Error("insert refused");
      },
    });
    assert.deepEqual(await run(deps), { status: "failed", error: "insert refused" });
    const { deps: readFails } = fakeDeps({
      loadFan: async () => {
        throw new Error("fans unavailable");
      },
    });
    assert.deepEqual(await run(readFails), { status: "failed", error: "fans unavailable" });
  });
});
