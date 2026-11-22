import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { TransactionalBatchResult, TransactionalRecipient } from "./email/transactional.ts";
import { REMINDER_EMAIL_LOG_TYPE, type ReminderEmailFan } from "./fan-reminder-email.ts";
import {
  resetReminderEmailWarning,
  sendFanReminderEmail,
  type ReminderEmailDeps,
  type ReminderEmailLogRow,
  type ReminderEmailRequest,
} from "./fan-reminder-email-send.ts";

const NOW = new Date("2026-11-22T21:05:00Z");
const APP_URL = "https://www.fanengagepro.com";
const RAELYNN = { slug: "raelynn", name: "RaeLynn" };

const FAN: ReminderEmailFan = {
  id: "fan-1",
  email: " mia@example.com ",
  first_name: "Mia",
  email_opted_in: true,
  suspended: false,
  is_internal: false,
  unsubscribe_token: "unsub-1",
};

const STREAK: ReminderEmailRequest = {
  reminder: "streak_at_risk",
  fanId: "fan-1",
  streakDays: 7,
  endsAtLocal: "tonight at 6 PM",
};

const OVERTAKEN: ReminderEmailRequest = {
  reminder: "leaderboard_overtaken",
  fanId: "fan-1",
  artist: RAELYNN,
  newRank: 4,
  previousRank: 3,
};

type Harness = {
  deps: ReminderEmailDeps;
  claims: ReminderEmailLogRow[];
  finished: Array<{ id: string; status: string; error: string | null }>;
  sent: TransactionalRecipient[][];
  reads: string[];
};

function okBatch(recipients: readonly TransactionalRecipient[]): TransactionalBatchResult {
  return {
    provider: "mandrill",
    outcomes: recipients.map((r) => ({ id: r.id, ok: true })),
    campaignId: null,
    error: null,
  };
}

function harness(overrides: Partial<ReminderEmailDeps> = {}): Harness {
  const claims: ReminderEmailLogRow[] = [];
  const finished: Harness["finished"] = [];
  const sent: TransactionalRecipient[][] = [];
  const reads: string[] = [];
  const deps: ReminderEmailDeps = {
    loadFan: async () => {
      reads.push("fan");
      return FAN;
    },
    loadPrefs: async () => ({ typeAllowed: true, inQuietHours: false }),
    loadArtist: async () => RAELYNN,
    hasRecentReminderEmail: async () => false,
    claim: async (row) => {
      claims.push(row);
      return `claim-${claims.length}`;
    },
    finish: async (id, result) => {
      finished.push({ id, ...result });
    },
    send: async (recipients) => {
      sent.push([...recipients]);
      return okBatch(recipients);
    },
    ...overrides,
  };
  return { deps, claims, finished, sent, reads };
}

function send(h: Harness, request: ReminderEmailRequest = STREAK, flags = { enabled: true, providerReady: true }) {
  return sendFanReminderEmail({ request, ...flags, appUrl: APP_URL, now: NOW, deps: h.deps });
}

describe("sendFanReminderEmail switches", () => {
  beforeEach(() => resetReminderEmailWarning());

  it("sends nothing and reads nobody while the switch is off", async () => {
    const h = harness();
    assert.deepEqual(await send(h, STREAK, { enabled: false, providerReady: true }), {
      status: "skipped",
      reason: "disabled",
    });
    assert.deepEqual(h.reads, []);
    assert.equal(h.sent.length, 0);
    assert.equal(h.claims.length, 0);
  });

  it("sends nothing without the provider and warns once", async () => {
    const h = harness();
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      const flags = { enabled: true, providerReady: false };
      const first = await send(h, STREAK, flags);
      await send(h, OVERTAKEN, flags);
      await send(h, STREAK, flags);
      assert.deepEqual(first, { status: "skipped", reason: "provider_not_configured" });
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.deepEqual(h.reads, []);
    assert.equal(h.sent.length, 0);
  });
});

describe("sendFanReminderEmail gates", () => {
  it("skips a streak that is too short", async () => {
    const h = harness();
    assert.deepEqual(await send(h, { ...STREAK, streakDays: 2 }), {
      status: "skipped",
      reason: "streak_too_short",
    });
    assert.equal(h.sent.length, 0);
  });

  it("skips fans who may not be emailed", async () => {
    const cases: Array<[Partial<ReminderEmailFan> | null, string]> = [
      [null, "fan_not_found"],
      [{ email_opted_in: false }, "not_opted_in"],
      [{ suspended: true }, "suspended"],
      [{ is_internal: true }, "internal"],
      [{ email: null }, "no_address"],
      [{ unsubscribe_token: "" }, "no_unsubscribe_link"],
    ];
    for (const [patch, reason] of cases) {
      const h = harness({ loadFan: async () => (patch ? { ...FAN, ...patch } : null) });
      assert.deepEqual(await send(h), { status: "skipped", reason });
      assert.equal(h.sent.length, 0);
      assert.equal(h.claims.length, 0);
    }
  });

  it("skips a fan who switched that reminder off", async () => {
    const asked: string[] = [];
    const h = harness({
      loadPrefs: async (_fanId, reminder) => {
        asked.push(reminder);
        return { typeAllowed: false, inQuietHours: false };
      },
    });
    assert.deepEqual(await send(h, OVERTAKEN), { status: "skipped", reason: "type_opted_out" });
    assert.deepEqual(asked, ["leaderboard_overtaken"]);
    assert.equal(h.sent.length, 0);
  });

  it("holds a streak email in quiet hours but not a leaderboard email", async () => {
    const quiet = { loadPrefs: async () => ({ typeAllowed: true, inQuietHours: true }) };
    const streak = harness(quiet);
    assert.deepEqual(await send(streak), { status: "skipped", reason: "quiet_hours" });
    assert.equal(streak.sent.length, 0);
    const board = harness(quiet);
    assert.deepEqual(await send(board, OVERTAKEN), { status: "sent" });
  });

  it("sends at most one reminder email of any kind in seven days", async () => {
    const asked: Array<[string, string]> = [];
    const h = harness({
      hasRecentReminderEmail: async (fanId, sinceIso) => {
        asked.push([fanId, sinceIso]);
        return true;
      },
    });
    assert.deepEqual(await send(h, OVERTAKEN), { status: "skipped", reason: "weekly_cap" });
    assert.deepEqual(asked, [["fan-1", "2026-11-15T21:05:00.000Z"]]);
    assert.equal(h.sent.length, 0);
    assert.equal(h.claims.length, 0);
  });

  it("keeps the cap across two sends through the durable record", async () => {
    const log: string[] = [];
    const h = harness({ hasRecentReminderEmail: async () => log.length > 0 });
    const claim = h.deps.claim;
    h.deps.claim = async (row) => {
      log.push(row.metadata.reminder);
      return claim(row);
    };
    assert.deepEqual(await send(h, STREAK), { status: "sent" });
    assert.deepEqual(await send(h, OVERTAKEN), { status: "skipped", reason: "weekly_cap" });
    assert.equal(h.sent.length, 1);
  });
});

describe("sendFanReminderEmail sending", () => {
  it("claims, sends one message to the fan, then records it as sent", async () => {
    const h = harness();
    assert.deepEqual(await send(h), { status: "sent" });
    assert.deepEqual(h.claims, [
      {
        fan_id: "fan-1",
        channel: "email",
        notification_type: REMINDER_EMAIL_LOG_TYPE,
        title: "Your 7-day streak ends tonight at 6 PM",
        url: "https://www.fanengagepro.com/artists/raelynn",
        status: "queued",
        metadata: { reminder: "streak_at_risk" },
      },
    ]);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].length, 1);
    assert.equal(h.sent[0][0].email, "mia@example.com");
    assert.equal(h.sent[0][0].subject, "Your 7-day streak ends tonight at 6 PM");
    assert.ok(h.sent[0][0].html.includes("/unsubscribe?token=unsub-1"));
    assert.deepEqual(h.finished, [{ id: "claim-1", status: "sent", error: null }]);
  });

  it("sends the leaderboard email without looking up the fan's artist", async () => {
    let artistReads = 0;
    const h = harness({
      loadArtist: async () => {
        artistReads += 1;
        return null;
      },
    });
    assert.deepEqual(await send(h, OVERTAKEN), { status: "sent" });
    assert.equal(artistReads, 0);
    assert.equal(h.sent[0][0].subject, "You dropped to #4 on RaeLynn's leaderboard");
    assert.equal(h.claims[0].metadata.reminder, "leaderboard_overtaken");
  });

  it("does not send when the claim cannot be written", async () => {
    const h = harness({
      claim: async () => {
        throw new Error("notification_log unavailable");
      },
    });
    assert.deepEqual(await send(h), { status: "failed", error: "notification_log unavailable" });
    assert.equal(h.sent.length, 0);
  });

  it("does not send when a read fails", async () => {
    const h = harness({
      hasRecentReminderEmail: async () => {
        throw new Error("cap lookup failed");
      },
    });
    assert.deepEqual(await send(h), { status: "failed", error: "cap lookup failed" });
    assert.equal(h.sent.length, 0);
    assert.equal(h.claims.length, 0);
  });

  it("records a rejected message as failed", async () => {
    const h = harness({
      send: async (recipients) => ({
        provider: "mandrill",
        outcomes: recipients.map((r) => ({ id: r.id, ok: false, error: "Mandrill status rejected" })),
        campaignId: null,
        error: null,
      }),
    });
    assert.deepEqual(await send(h), { status: "failed", error: "Mandrill status rejected" });
    assert.deepEqual(h.finished, [{ id: "claim-1", status: "failed", error: "Mandrill status rejected" }]);
  });

  it("records a provider that throws as failed and does not throw", async () => {
    const h = harness({
      send: async () => {
        throw new Error("network down");
      },
    });
    assert.deepEqual(await send(h), { status: "failed", error: "network down" });
    assert.deepEqual(h.finished, [{ id: "claim-1", status: "failed", error: "network down" }]);
  });

  it("still reports sent when the record cannot be updated afterwards", async () => {
    const original = console.warn;
    console.warn = () => {};
    try {
      const h = harness({
        finish: async () => {
          throw new Error("update failed");
        },
      });
      assert.deepEqual(await send(h), { status: "sent" });
      assert.equal(h.sent.length, 1);
    } finally {
      console.warn = original;
    }
  });
});
