import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TransactionalBatchResult, TransactionalRecipient } from "./email/transactional.ts";
import type { AudienceMessage } from "./audience-email.ts";
import type { ReminderFanRow } from "./event-reminder-email.ts";
import {
  AUDIENCE_EMAIL_NOT_READ,
  sendAudienceEmails,
  type ChosenAudience,
} from "./audience-email-send.ts";

const MESSAGE: AudienceMessage = {
  subject: "Message from RaeLynn",
  body: "New single Friday!",
  artistName: "RaeLynn",
  reason: "follower",
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

const audience = (a: ChosenAudience) => async () => a;
const base = { message: MESSAGE, appUrl: "https://www.fanengagepro.com", providerReady: true };

describe("sendAudienceEmails", () => {
  it("emails only the chosen fans who may be emailed, one message each with their own link", async () => {
    const { calls, send } = recorder();
    const result = await sendAudienceEmails({
      ...base,
      loadAudience: audience({
        chosenFanIds: ["a", "b", "c", "d", "e"],
        fans: [
          fan("a"),
          fan("b", { email_opted_in: false }),
          fan("c", { is_internal: true }),
          fan("d", { suspended: true }),
          fan("e", { unsubscribe_token: null }),
          fan("other-artist-fan"),
        ],
      }),
      send,
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].map((r) => r.email), ["a@example.com"]);
    assert.ok(calls[0][0].html.includes("/unsubscribe?token=unsub-a"));
    assert.deepEqual(result, { configured: true, chosen: 5, sent: 1, failed: 0, skipped: 4, error: null });
  });

  it("counts a chosen fan with no fans row as skipped", async () => {
    const { send } = recorder();
    const result = await sendAudienceEmails({
      ...base,
      loadAudience: audience({ chosenFanIds: ["a", "gone", "a"], fans: [fan("a")] }),
      send,
    });
    assert.deepEqual(result, { configured: true, chosen: 2, sent: 1, failed: 0, skipped: 1, error: null });
  });

  it("sends nothing and reads nobody when the per-fan provider is not set up", async () => {
    const { calls, send } = recorder();
    let loaded = false;
    const result = await sendAudienceEmails({
      ...base,
      providerReady: false,
      loadAudience: async () => {
        loaded = true;
        return { chosenFanIds: ["a"], fans: [fan("a")] };
      },
      send,
    });
    assert.equal(loaded, false);
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { configured: false, chosen: 0, sent: 0, failed: 0, skipped: 0, error: null });
  });

  it("does not call the provider when nobody was chosen", async () => {
    const { calls, send } = recorder();
    const result = await sendAudienceEmails({
      ...base,
      loadAudience: audience({ chosenFanIds: [], fans: [fan("a")] }),
      send,
    });
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { configured: true, chosen: 0, sent: 0, failed: 0, skipped: 0, error: null });
  });

  it("counts a failed fan without stopping the others", async () => {
    const { send } = recorder((recipients) => ({
      provider: "mandrill",
      outcomes: recipients.map((r) => (r.id === "a" ? { id: r.id, ok: false, error: "rejected" } : { id: r.id, ok: true })),
      campaignId: null,
      error: null,
    }));
    const result = await sendAudienceEmails({
      ...base,
      loadAudience: audience({ chosenFanIds: ["a", "b", "c"], fans: [fan("a"), fan("b"), fan("c")] }),
      send,
    });
    assert.deepEqual(result, { configured: true, chosen: 3, sent: 2, failed: 1, skipped: 0, error: null });
  });

  it("returns an error and sends nothing when the fans cannot be read", async () => {
    const { calls, send } = recorder();
    const result = await sendAudienceEmails({
      ...base,
      loadAudience: async () => {
        throw new Error("fans: timeout");
      },
      send,
    });
    assert.equal(calls.length, 0);
    assert.deepEqual(result, {
      configured: true,
      chosen: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: `${AUDIENCE_EMAIL_NOT_READ}: fans: timeout`,
    });
  });

  it("counts everyone as failed, without throwing, when the send itself throws", async () => {
    const result = await sendAudienceEmails({
      ...base,
      loadAudience: audience({ chosenFanIds: ["a", "b"], fans: [fan("a"), fan("b", { email_opted_in: false })] }),
      send: async () => {
        throw new Error("network down");
      },
    });
    assert.deepEqual(result, { configured: true, chosen: 2, sent: 0, failed: 1, skipped: 1, error: "network down" });
  });

  it("passes on an error that stopped every send", async () => {
    const { send } = recorder(() => ({ provider: null, outcomes: [], campaignId: null, error: "MANDRILL_API_KEY is not set" }));
    const result = await sendAudienceEmails({
      ...base,
      loadAudience: audience({ chosenFanIds: ["a"], fans: [fan("a")] }),
      send,
    });
    assert.deepEqual(result, { configured: true, chosen: 1, sent: 0, failed: 1, skipped: 0, error: "MANDRILL_API_KEY is not set" });
  });
});
