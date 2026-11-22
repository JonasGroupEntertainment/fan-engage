import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MANDRILL_SEND_CONCURRENCY,
  MANDRILL_TIMEOUT_MS,
  sendMandrillBatch,
  type TransactionalRecipient,
} from "./transactional.ts";

const ENV = { MANDRILL_API_KEY: "test" };
const TAGS = ["test"] as const;

function recipients(n: number): TransactionalRecipient[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    email: `r${i}@example.com`,
    name: "",
    subject: "s",
    html: "<p>h</p>",
    text: "t",
  }));
}

const accepted = () => new Response(JSON.stringify([{ status: "sent" }]), { status: 200 });

function emailOf(init: RequestInit | undefined): string {
  return JSON.parse(String(init?.body)).message.to[0].email as string;
}

describe("sendMandrillBatch", () => {
  it("uses a 10 second limit and sends 5 at a time", () => {
    assert.equal(MANDRILL_TIMEOUT_MS, 10_000);
    assert.equal(MANDRILL_SEND_CONCURRENCY, 5);
  });

  it("never sends more than the limit at once and keeps outcomes in order", async () => {
    let running = 0;
    let peak = 0;
    const fetchImpl = (async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      running -= 1;
      return accepted();
    }) as typeof fetch;
    const batch = recipients(12);
    const result = await sendMandrillBatch(batch, TAGS, ENV, { fetchImpl });
    assert.equal(peak, MANDRILL_SEND_CONCURRENCY);
    assert.deepEqual(result.outcomes.map((o) => o.id), batch.map((r) => r.id));
    assert.ok(result.outcomes.every((o) => o.ok));
  });

  it("one fan's failure never stops the others", async () => {
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      if (emailOf(init) === "r1@example.com") throw new Error("socket hang up");
      if (emailOf(init) === "r2@example.com") return new Response("nope", { status: 500 });
      return accepted();
    }) as typeof fetch;
    const result = await sendMandrillBatch(recipients(4), TAGS, ENV, { fetchImpl });
    assert.deepEqual(result.outcomes.map((o) => o.ok), [true, false, false, true]);
    assert.equal(result.outcomes[1].error, "socket hang up");
  });

  it("a hung request comes back as a failed send, not a throw", async () => {
    // AbortSignal.timeout uses an unref'd timer; keep the process busy.
    const keepBusy = setTimeout(() => {}, 5_000);
    try {
      const fetchImpl = ((_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          assert.ok(signal, "fetch is given a signal");
          signal.addEventListener("abort", () => reject(signal.reason));
        })) as typeof fetch;
      const result = await sendMandrillBatch(recipients(2), TAGS, ENV, { fetchImpl, timeoutMs: 20 });
      assert.deepEqual(result.outcomes.map((o) => o.ok), [false, false]);
      assert.match(result.outcomes[0].error ?? "", /timed out/);
      assert.equal(result.error, null);
    } finally {
      clearTimeout(keepBusy);
    }
  });
});
