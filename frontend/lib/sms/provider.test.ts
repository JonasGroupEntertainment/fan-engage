import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AGE_ADULT_ONLY_MESSAGE } from "../age-gate.ts";
import { handleInboundSms, type SmsFanDirectory } from "./inbound.ts";
import {
  SMS_START_REPLY,
  SMS_STOP_REPLY,
  classifySmsKeyword,
  smsHelpReply,
} from "./keywords.ts";
import {
  MANDRILL_SMS_ALLOW_URL,
  MANDRILL_SMS_DENY_URL,
  MANDRILL_SMS_SEND_URL,
  MANDRILL_URL_CHECK_KEY,
  inboundTexts,
  mandrillWebhookAuthorized,
  mandrillWebhookSignature,
  marketingSmsOptOutPhone,
  transactionalOptOutPhones,
  type FetchLike,
} from "./mandrill.ts";
import { deliverSms, smsProviderName, syncSmsOptInWithProvider } from "./deliver.ts";
import { smsAgeAllowsSend } from "./policy.ts";

const SUPPORT = "support@fanengagepro.com";
const ADULT = "1990-01-01";
const UNDER_18 = "2010-11-19";
const NOW = new Date("2026-11-18T12:00:00Z");

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

function directory(fans: Array<{ id: string; phone: string; birthDate: string | null }>): SmsFanDirectory & {
  opted: Map<string, boolean>;
} {
  const opted = new Map<string, boolean>();
  return {
    opted,
    async findByPhone(from: string) {
      const digits = from.replace(/\D/g, "");
      const fan = fans.find((row) => row.phone.replace(/\D/g, "") === digits);
      return fan ? { id: fan.id, birthDate: fan.birthDate } : null;
    },
    async setOptIn(id: string, value: boolean) {
      opted.set(id, value);
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SMS provider setting", () => {
  it("defaults to twilio until the setting is mailchimp", () => {
    assert.equal(smsProviderName({}), "twilio");
    assert.equal(smsProviderName({ SMS_PROVIDER: "" }), "twilio");
    assert.equal(smsProviderName({ SMS_PROVIDER: "twilio" }), "twilio");
    assert.equal(smsProviderName({ SMS_PROVIDER: "MAILCHIMP" }), "mailchimp");
    assert.equal(smsProviderName({ SMS_PROVIDER: "mailchimo" }), "twilio");
  });
});

describe("18+ send gate", () => {
  it("blocks a known under-18 date and allows 18 and unknown", () => {
    assert.equal(smsAgeAllowsSend(UNDER_18, NOW), false);
    assert.equal(smsAgeAllowsSend("2008-11-19", NOW), false);
    assert.equal(smsAgeAllowsSend("2008-11-18", NOW), true);
    assert.equal(smsAgeAllowsSend(ADULT, NOW), true);
    assert.equal(smsAgeAllowsSend(null, NOW), true);
    assert.equal(smsAgeAllowsSend(undefined, NOW), true);
    assert.equal(smsAgeAllowsSend("", NOW), true);
  });

  it("is enforced on every server send path", () => {
    for (const rel of [
      "../notifications/sms.ts",
      "../broadcast.ts",
      "../event-matching/send.ts",
      "../../app/api/fan-engage/sms/route.ts",
    ]) {
      assert.match(readRepo(rel), /smsAgeAllowsSend/);
    }
  });
});

describe("Mailchimp Transactional send", () => {
  const env = {
    SMS_PROVIDER: "mailchimp",
    MAILCHIMP_TRANSACTIONAL_API_KEY: "test-key",
    MAILCHIMP_SMS_FROM: "+16155550199",
  };

  it("posts one E.164 recipient to messages/send-sms and does not call Twilio", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return jsonResponse([
        { status: "sent", _id: "abc", to: "+16155550123", from: "+16155550199" },
      ]);
    };
    const result = await deliverSms(
      { to: "6155550123", body: "Hello from Fan Engage" },
      { env, fetchImpl },
    );
    assert.equal(result.ok, true);
    assert.equal(result.id, "abc");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, MANDRILL_SMS_SEND_URL);
    const sms = (calls[0].body.message as { sms: Record<string, unknown> }).sms;
    assert.equal(calls[0].body.key, "test-key");
    assert.deepEqual(sms.to, ["+16155550123"]);
    assert.equal(sms.from, "+16155550199");
    assert.equal(sms.consent, "recurring-no-confirm");
    assert.match(String(sms.text), /^Hello from Fan Engage/);
    assert.match(String(sms.text), /Reply STOP to opt out/);
  });

  it("treats a denylist rejection as an opt-out and refuses a bad consent value", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse([{ status: "rejected", reject_reason: "unsub", _id: "nope" }]);
    const rejected = await deliverSms({ to: "+16155550123", body: "Hi" }, { env, fetchImpl });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.optOut, true);

    let called = false;
    const blocked: FetchLike = async () => {
      called = true;
      return jsonResponse([]);
    };
    const bad = await deliverSms(
      { to: "+16155550123", body: "Hi" },
      { env: { ...env, MAILCHIMP_SMS_CONSENT: "marketing" }, fetchImpl: blocked },
    );
    assert.equal(bad.configured, false);
    assert.equal(called, false);
  });

  it("stays on Twilio and does not call Mailchimp when the setting is unset", async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return jsonResponse([]);
    };
    const result = await deliverSms(
      { to: "+16155550123", body: "Hi" },
      { env: {}, fetchImpl },
    );
    assert.equal(result.ok, false);
    assert.equal(result.configured, false);
    assert.match(result.error ?? "", /Twilio/);
    assert.equal(called, false);
  });

  it("syncs opt-out and opt-in only while Mailchimp is selected", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      return jsonResponse({ added: true, phone: "+16155550123" });
    };
    await syncSmsOptInWithProvider("+16155550123", false, { env, fetchImpl });
    await syncSmsOptInWithProvider("+16155550123", true, { env, fetchImpl });
    assert.deepEqual(urls, [MANDRILL_SMS_DENY_URL, MANDRILL_SMS_ALLOW_URL]);

    urls.length = 0;
    await syncSmsOptInWithProvider("+16155550123", false, { env: {}, fetchImpl });
    assert.equal(urls.length, 0);
  });
});

describe("STOP, HELP, and START", () => {
  const fans = [{ id: "fan-1", phone: "+16155550123", birthDate: ADULT }];

  it("classifies both providers' keyword lists", () => {
    for (const word of ["STOP", "stop.", "STOPALL", "UNSUBSCRIBE", "OPTOUT", "REVOKE", "ARRET"]) {
      assert.equal(classifySmsKeyword(word), "stop", word);
    }
    for (const word of ["HELP", "INFO", "AIDE"]) {
      assert.equal(classifySmsKeyword(word), "help", word);
    }
    for (const word of ["START", "YES", "UNSTOP"]) {
      assert.equal(classifySmsKeyword(word), "start", word);
    }
    assert.equal(classifySmsKeyword("see you there"), "other");
  });

  it("opts out on STOP for both providers and only Twilio replies", async () => {
    for (const provider of ["twilio", "mailchimp"] as const) {
      const store = directory(fans);
      const outcome = await handleInboundSms({
        from: "+1 (615) 555-0123",
        text: "STOP",
        provider,
        directory: store,
        supportEmail: SUPPORT,
        now: NOW,
      });
      assert.equal(outcome.action, "stop");
      assert.equal(store.opted.get("fan-1"), false);
      assert.equal(outcome.reply, provider === "twilio" ? SMS_STOP_REPLY : null);
    }
  });

  it("answers HELP without changing opt-in, and can leave Mailchimp's own reply alone", async () => {
    for (const provider of ["twilio", "mailchimp"] as const) {
      const store = directory(fans);
      const outcome = await handleInboundSms({
        from: "+16155550123",
        text: "HELP",
        provider,
        directory: store,
        supportEmail: SUPPORT,
        now: NOW,
      });
      assert.equal(outcome.action, "help");
      assert.equal(outcome.optedIn, null);
      assert.equal(store.opted.size, 0);
      assert.equal(outcome.reply, smsHelpReply(SUPPORT));
    }
    const quiet = await handleInboundSms({
      from: "+16155550123",
      text: "HELP",
      provider: "mailchimp",
      directory: directory(fans),
      supportEmail: SUPPORT,
      sendKeywordReplies: false,
    });
    assert.equal(quiet.reply, null);
    const twilioStillReplies = await handleInboundSms({
      from: "+16155550123",
      text: "HELP",
      provider: "twilio",
      directory: directory(fans),
      supportEmail: SUPPORT,
      sendKeywordReplies: false,
    });
    assert.equal(twilioStillReplies.reply, smsHelpReply(SUPPORT));
  });

  it("opts an adult back in on START and refuses a known under-18", async () => {
    for (const provider of ["twilio", "mailchimp"] as const) {
      const adults = directory(fans);
      const back = await handleInboundSms({
        from: "+16155550123",
        text: "START",
        provider,
        directory: adults,
        supportEmail: SUPPORT,
        now: NOW,
      });
      assert.equal(back.optedIn, true);
      assert.equal(adults.opted.get("fan-1"), true);
      assert.equal(back.reply, SMS_START_REPLY);

      const minors = directory([{ id: "kid", phone: "+16155550124", birthDate: UNDER_18 }]);
      const blocked = await handleInboundSms({
        from: "+16155550124",
        text: "START please",
        provider,
        directory: minors,
        supportEmail: SUPPORT,
        now: NOW,
      });
      assert.equal(blocked.optedIn, null);
      assert.equal(minors.opted.size, 0);
      assert.equal(blocked.reply, AGE_ADULT_ONLY_MESSAGE);
    }
  });
});

describe("Mailchimp webhook parsing", () => {
  it("signs the documented URL plus sorted form fields", () => {
    const url = "https://www.fanengagepro.com/api/mailchimp/sms/events";
    const params = { mandrill_events: "[]" };
    const expected = createHmac("sha1", "hook-key")
      .update(url + "mandrill_events" + params.mandrill_events)
      .digest("base64");
    assert.equal(mandrillWebhookSignature("hook-key", url, params), expected);
    assert.equal(
      mandrillWebhookAuthorized({
        header: expected,
        url,
        params,
        webhookKey: "hook-key",
      }),
      true,
    );
    assert.equal(
      mandrillWebhookAuthorized({
        header: expected,
        url,
        params,
        webhookKey: "other-key",
      }),
      false,
    );
  });

  it("accepts Mailchimp's empty URL-check post and rejects unsigned events", () => {
    const url = "https://www.fanengagepro.com/api/mailchimp/sms/inbound";
    const params = { mandrill_events: "[]" };
    const header = mandrillWebhookSignature(MANDRILL_URL_CHECK_KEY, url, params);
    assert.equal(
      mandrillWebhookAuthorized({ header, url, params, webhookKey: undefined }),
      true,
    );
    assert.equal(
      mandrillWebhookAuthorized({
        header: "nope",
        url,
        params: { mandrill_events: JSON.stringify([{ event: "unsub" }]) },
        webhookKey: "hook-key",
      }),
      false,
    );
  });

  it("reads an inbound STOP and ignores an email-shaped inbound", () => {
    const messages = inboundTexts([
      {
        event: "inbound",
        msg: { from_phone: "+16155550123", text: "STOP" },
      },
      {
        event: "inbound",
        msg: { from_email: "fan@example.com", text: "STOP", email: "inbound@example.com" },
      },
    ]);
    assert.deepEqual(messages, [{ from: "+16155550123", text: "STOP" }]);
  });

  it("opts out SMS unsubscribes and denylist adds, not email unsubscribes", () => {
    const phones = transactionalOptOutPhones([
      { event: "unsub", channel: "sms", msg: { phone: "+16155550123" } },
      { event: "unsub", channel: "email", msg: { email: "fan@example.com", phone: "+16155550999" } },
      { type: "denylist", action: "add", reject: { phone: "+1 615 555 0124" } },
      { type: "denylist", action: "add", reject: { email: "fan@example.com" } },
      { type: "denylist", action: "remove", reject: { phone: "+16155550125" } },
      { event: "reject", channel: "sms", reject_reason: "unsub", msg: { to: "+16155550126" } },
    ]);
    assert.deepEqual(phones, ["+16155550123", "+16155550124", "+16155550126"]);
  });

  it("reads a Marketing SMS unsubscribe and ignores an email unsubscribe", () => {
    assert.equal(
      marketingSmsOptOutPhone({
        type: "sms_unsubscribe",
        "data[email]": "fan@example.com",
        "data[sms_phone_number]": "+16155550123",
      }),
      "+16155550123",
    );
    assert.equal(
      marketingSmsOptOutPhone({
        type: "unsubscribe",
        "data[email]": "fan@example.com",
        "data[merges][PHONE]": "+16155550123",
      }),
      null,
    );
  });
});
