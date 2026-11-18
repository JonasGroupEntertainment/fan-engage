import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHARED_SMS_NUMBER,
  SMS_FORWARD_MAX_SKEW_MS,
  buildSmsForwardEvent,
  forwardInboundSms,
  smsForwardAccepted,
  smsForwardBody,
  smsForwardSignature,
} from "./forward.ts";
import type { FetchLike } from "./mandrill.ts";

const NOW = new Date("2026-11-18T12:00:00.000Z");

describe("SMS forward contract", () => {
  const event = buildSmsForwardEvent(
    { from: "+16155550123", to: null, text: "STOP", ts: null, eventId: "evt-1" },
    { env: {}, now: NOW },
  );

  it("fills the shared number and signs the raw JSON body", () => {
    assert.equal(event.to, SHARED_SMS_NUMBER);
    assert.equal(event.from, "+16155550123");
    assert.equal(event.text, "STOP");
    assert.equal(event.ts, NOW.toISOString());
    assert.equal(event.event_id, "evt-1");
    const raw = smsForwardBody(event);
    assert.equal(
      raw,
      JSON.stringify({
        from: "+16155550123",
        to: SHARED_SMS_NUMBER,
        text: "STOP",
        ts: NOW.toISOString(),
        event_id: "evt-1",
      }),
    );
    const signature = smsForwardSignature("forward-secret", raw);
    assert.equal(signature, smsForwardSignature("forward-secret", raw));
    assert.equal(
      smsForwardAccepted({
        secret: "forward-secret",
        rawBody: raw,
        signatureHeader: signature,
        timestampHeader: NOW.toISOString(),
        now: new Date(NOW.getTime() + 4 * 60 * 1000),
      }),
      true,
    );
    assert.equal(
      smsForwardAccepted({
        secret: "forward-secret",
        rawBody: raw,
        signatureHeader: signature,
        timestampHeader: NOW.toISOString(),
        now: new Date(NOW.getTime() + SMS_FORWARD_MAX_SKEW_MS + 1),
      }),
      false,
    );
    assert.equal(
      smsForwardAccepted({
        secret: "forward-secret",
        rawBody: raw,
        signatureHeader: "nope",
        timestampHeader: NOW.toISOString(),
        now: NOW,
      }),
      false,
    );
  });

  it("skips the POST when the forward env is unset and logs a failed POST", async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return new Response("no", { status: 500 });
    };
    await forwardInboundSms(event, { env: {}, fetchImpl, now: NOW });
    assert.equal(called, false);

    const calls: Array<{ url: string; body: string; signature: string; timestamp: string }> = [];
    const posting: FetchLike = async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        body: String(init?.body),
        signature: headers.get("X-SMS-Forward-Signature") ?? "",
        timestamp: headers.get("X-SMS-Forward-Timestamp") ?? "",
      });
      return new Response("ok", { status: 200 });
    };
    await forwardInboundSms(event, {
      env: {
        BEP_SMS_FORWARD_URL: "https://brand.example/api/sms/inbound-forward",
        SMS_FORWARD_SECRET: "forward-secret",
      },
      fetchImpl: posting,
      now: NOW,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://brand.example/api/sms/inbound-forward");
    assert.equal(calls[0].body, smsForwardBody(event));
    assert.equal(calls[0].signature, smsForwardSignature("forward-secret", calls[0].body));
    assert.equal(calls[0].timestamp, NOW.toISOString());
    assert.equal(
      smsForwardAccepted({
        secret: "forward-secret",
        rawBody: calls[0].body,
        signatureHeader: calls[0].signature,
        timestampHeader: calls[0].timestamp,
        now: NOW,
      }),
      true,
    );

    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    const failing: FetchLike = async () => {
      throw new Error("timed out");
    };
    try {
      await forwardInboundSms(event, {
        env: {
          BEP_SMS_FORWARD_URL: "https://brand.example/api/sms/inbound-forward",
          SMS_FORWARD_SECRET: "forward-secret",
        },
        fetchImpl: failing,
        now: NOW,
      });
      assert.match(warnings.join("\n"), /SMS forward to Brand Engage Pro failed/);
      assert.match(warnings.join("\n"), /evt-1/);
    } finally {
      console.warn = original;
    }
  });
});
