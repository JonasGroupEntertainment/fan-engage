import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TransactionalBatchResult, TransactionalRecipient } from "./email/transactional.ts";
import type { ReminderEvent, ReminderFanRow } from "./event-reminder-email.ts";
import {
  EVENT_REMINDER_NO_PROVIDER,
  sendEventReminderEmails,
  type ReminderRsvpAudience,
} from "./event-reminder-email-send.ts";

const EVENT: ReminderEvent = {
  id: "event-1",
  title: "Listening Party",
  detail: null,
  location: null,
  url: null,
  artist_name: "RaeLynn",
};

function fan(id: string, over: Partial<ReminderFanRow> = {}): ReminderFanRow {
  return {
    id,
    email: `${id}@example.com`,
    first_name: "Sam",
    email_opted_in: true,
    suspended: false,
    is_internal: false,
    unsubscribe_token: `unsub-${id}`,
    ...over,
  };
}

function recorder(result?: (r: readonly TransactionalRecipient[]) => TransactionalBatchResult) {
  const calls: TransactionalRecipient[][] = [];
  const send = async (recipients: readonly TransactionalRecipient[]) => {
    calls.push([...recipients]);
    if (result) return result(recipients);
    return {
      provider: "mandrill" as const,
      outcomes: recipients.map((r) => ({ id: r.id, ok: true })),
      campaignId: null,
      error: null,
    };
  };
  return { calls, send };
}

const audience = (a: ReminderRsvpAudience) => async () => a;
const base = { event: EVENT, kind: "reminder_24h" as const, appUrl: "https://www.fanengagepro.com", providerReady: true };

describe("sendEventReminderEmails", () => {
  it("emails only fans who RSVPed and may be emailed, one message each", async () => {
    const { calls, send } = recorder();
    const result = await sendEventReminderEmails({
      ...base,
      loadAudience: audience({
        rsvpFanIds: ["a", "b", "c"],
        fans: [fan("a"), fan("b", { email_opted_in: false }), fan("c", { is_internal: true }), fan("stranger")],
      }),
      send,
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].map((r) => r.email), ["a@example.com"]);
    assert.ok(calls[0][0].html.includes("/unsubscribe?token=unsub-a"));
    assert.deepEqual(result, { recipients: 1, sent: 1, failed: 0, error: null });
  });

  it("sends nothing and reads nobody when the per-fan provider is not set up", async () => {
    const { calls, send } = recorder();
    let loaded = false;
    const result = await sendEventReminderEmails({
      ...base,
      providerReady: false,
      loadAudience: async () => {
        loaded = true;
        return { rsvpFanIds: ["a"], fans: [fan("a")] };
      },
      send,
    });
    assert.equal(loaded, false);
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { recipients: 0, sent: 0, failed: 0, error: EVENT_REMINDER_NO_PROVIDER });
  });

  it("does not call the provider when nobody RSVPed", async () => {
    const { calls, send } = recorder();
    const result = await sendEventReminderEmails({
      ...base,
      loadAudience: audience({ rsvpFanIds: [], fans: [fan("a")] }),
      send,
    });
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { recipients: 0, sent: 0, failed: 0, error: null });
  });

  it("counts a failed fan without stopping the others", async () => {
    const { send } = recorder((recipients) => ({
      provider: "mandrill",
      outcomes: recipients.map((r) => (r.id === "a" ? { id: r.id, ok: false, error: "Mandrill status rejected" } : { id: r.id, ok: true })),
      campaignId: null,
      error: null,
    }));
    const result = await sendEventReminderEmails({
      ...base,
      loadAudience: audience({ rsvpFanIds: ["a", "b"], fans: [fan("a"), fan("b")] }),
      send,
    });
    assert.equal(result.recipients, 2);
    assert.equal(result.sent, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.error, "1 of 2 reminder emails failed");
  });

  it("returns an error instead of throwing when the audience read fails", async () => {
    const { calls, send } = recorder();
    const result = await sendEventReminderEmails({
      ...base,
      loadAudience: async () => {
        throw new Error("event_rsvps: boom");
      },
      send,
    });
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { recipients: 0, sent: 0, failed: 0, error: "event_rsvps: boom" });
  });

  it("returns an error instead of throwing when the provider throws", async () => {
    const result = await sendEventReminderEmails({
      ...base,
      loadAudience: audience({ rsvpFanIds: ["a"], fans: [fan("a")] }),
      send: async () => {
        throw new Error("network down");
      },
    });
    assert.deepEqual(result, { recipients: 1, sent: 0, failed: 1, error: "network down" });
  });
});
