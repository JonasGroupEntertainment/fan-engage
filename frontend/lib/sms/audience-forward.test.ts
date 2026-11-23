import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { handleMarketingAudienceSms } from "./audience-forward.ts";
import { SHARED_SMS_NUMBER, smsForwardAccepted, smsForwardSignature } from "./forward.ts";
import type { FetchLike } from "./mandrill.ts";

const NOW = new Date("2026-11-23T19:00:00.000Z");
const PHONE = "+16155550123";
const SECRET = "forward-secret";
const FORWARD_URL = "https://brand.example/api/sms/inbound-forward";

const forwardEnv = {
  BEP_SMS_FORWARD_URL: FORWARD_URL,
  SMS_FORWARD_SECRET: SECRET,
};

function unsubscribeParams(extra: Record<string, string> = {}): Record<string, string> {
  return {
    type: "sms_unsubscribe",
    fired_at: "2026-11-23 18:59:00",
    "data[email]": "fan@example.com",
    "data[sms_phone_number]": "+1 (615) 555-0123",
    ...extra,
  };
}

type Captured = { url: string; body: string; signature: string; timestamp: string; contentType: string };

function capturingFetch(calls: Captured[], response?: () => Promise<Response> | Response): FetchLike {
  return async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      body: String(init?.body),
      signature: headers.get("X-SMS-Forward-Signature") ?? "",
      timestamp: headers.get("X-SMS-Forward-Timestamp") ?? "",
      contentType: headers.get("Content-Type") ?? "",
    });
    if (response) return response();
    return new Response("ok", { status: 200 });
  };
}

describe("Marketing audience SMS forward", () => {
  it("forwards an SMS unsubscribe once with a valid signature", async () => {
    const calls: Captured[] = [];
    const opted: string[] = [];
    const result = await handleMarketingAudienceSms({
      params: unsubscribeParams(),
      optOutLocally: async (phone) => {
        opted.push(phone);
      },
      env: forwardEnv,
      fetchImpl: capturingFetch(calls),
      now: NOW,
    });

    assert.equal(result, "ok");
    assert.deepEqual(opted, [PHONE]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, FORWARD_URL);
    assert.equal(calls[0].contentType, "application/json");
    assert.equal(calls[0].timestamp, NOW.toISOString());
    assert.equal(calls[0].signature, smsForwardSignature(SECRET, calls[0].body));
    assert.equal(
      smsForwardAccepted({
        secret: SECRET,
        rawBody: calls[0].body,
        signatureHeader: calls[0].signature,
        timestampHeader: calls[0].timestamp,
        now: NOW,
      }),
      true,
    );
    assert.deepEqual(JSON.parse(calls[0].body), {
      from: PHONE,
      to: SHARED_SMS_NUMBER,
      text: "STOP",
      ts: "2026-11-23 18:59:00",
      event_id: JSON.parse(calls[0].body).event_id,
    });
    assert.equal(typeof JSON.parse(calls[0].body).event_id, "string");
    assert.ok(JSON.parse(calls[0].body).event_id.length > 0);
  });

  it("does not forward subscribe, email unsubscribe, or other events", async () => {
    const calls: Captured[] = [];
    const opted: string[] = [];
    const events: Record<string, string>[] = [
      { type: "subscribe", "data[sms_phone_number]": PHONE, fired_at: "2026-11-23 18:59:00" },
      { type: "unsubscribe", "data[email]": "fan@example.com", "data[merges][PHONE]": PHONE },
      { type: "profile", "data[sms_phone_number]": PHONE },
      { type: "cleaned", "data[email]": "fan@example.com" },
      { type: "sms_unsubscribe", "data[email]": "fan@example.com" },
    ];
    for (const params of events) {
      const result = await handleMarketingAudienceSms({
        params,
        optOutLocally: async (phone) => {
          opted.push(phone);
        },
        env: forwardEnv,
        fetchImpl: capturingFetch(calls),
        now: NOW,
      });
      assert.equal(result, "ok");
    }
    assert.deepEqual(opted, []);
    assert.equal(calls.length, 0);
  });

  it("keeps Fan Engage's opt-out when the forward fails", async () => {
    const opted: string[] = [];
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const thrown = await handleMarketingAudienceSms({
        params: unsubscribeParams(),
        optOutLocally: async (phone) => {
          opted.push(phone);
        },
        env: forwardEnv,
        fetchImpl: async () => {
          throw new Error("timed out");
        },
        now: NOW,
      });
      const rejected = await handleMarketingAudienceSms({
        params: unsubscribeParams(),
        optOutLocally: async (phone) => {
          opted.push(phone);
        },
        env: forwardEnv,
        fetchImpl: async () => new Response("no", { status: 502 }),
        now: NOW,
      });
      assert.equal(thrown, "ok");
      assert.equal(rejected, "ok");
      assert.deepEqual(opted, [PHONE, PHONE]);
      assert.match(warnings.join("\n"), /SMS forward to Brand Engage Pro failed/);
      assert.match(warnings.join("\n"), /status 502/);
    } finally {
      console.warn = original;
    }
  });

  it("still forwards when Fan Engage's own opt-out throws", async () => {
    const calls: Captured[] = [];
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      const result = await handleMarketingAudienceSms({
        params: unsubscribeParams(),
        optOutLocally: async () => {
          throw new Error("db down");
        },
        env: forwardEnv,
        fetchImpl: capturingFetch(calls),
        now: NOW,
      });
      assert.equal(result, "error");
      assert.equal(calls.length, 1);
      assert.equal(JSON.parse(calls[0].body).text, "STOP");
      assert.match(errors.join("\n"), /Mailchimp audience SMS opt-out failed/);
    } finally {
      console.error = original;
    }
  });

  it("skips the forward when the forward env is missing and still opts out", async () => {
    const cases = [{}, { BEP_SMS_FORWARD_URL: FORWARD_URL }, { SMS_FORWARD_SECRET: SECRET }];
    for (const env of cases) {
      let called = false;
      const opted: string[] = [];
      const result = await handleMarketingAudienceSms({
        params: unsubscribeParams(),
        optOutLocally: async (phone) => {
          opted.push(phone);
        },
        env,
        fetchImpl: async () => {
          called = true;
          return new Response("ok", { status: 200 });
        },
        now: NOW,
      });
      assert.equal(result, "ok");
      assert.equal(called, false);
      assert.deepEqual(opted, [PHONE]);
    }
  });

  it("the audience route uses the shared handler and does not sign on its own", () => {
    const route = readFileSync(
      fileURLToPath(new URL("../../app/api/mailchimp/sms/audience/route.ts", import.meta.url)),
      "utf8",
    );
    assert.match(route, /handleMarketingAudienceSms\(/);
    assert.equal(route.includes("createHmac"), false);
    assert.equal(route.includes("smsForwardSignature"), false);
    assert.equal(route.includes("BEP_SMS_FORWARD_URL"), false);
  });
});
