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
import { smsSendClass } from "./kinds.ts";
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
import { deliverSms, promotionalSmsEnabled, syncSmsOptInWithProvider } from "./deliver.ts";
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

describe("promotional SMS flag", () => {
  it("stays off unless the setting is an explicit yes", () => {
    assert.equal(promotionalSmsEnabled({}), false);
    assert.equal(promotionalSmsEnabled({ MAILCHIMP_SMS_PROMOTIONAL_ENABLED: "" }), false);
    assert.equal(promotionalSmsEnabled({ MAILCHIMP_SMS_PROMOTIONAL_ENABLED: "false" }), false);
    assert.equal(promotionalSmsEnabled({ MAILCHIMP_SMS_PROMOTIONAL_ENABLED: "true" }), true);
    assert.equal(promotionalSmsEnabled({ MAILCHIMP_SMS_PROMOTIONAL_ENABLED: "1" }), true);
    assert.equal(promotionalSmsEnabled({ MAILCHIMP_SMS_PROMOTIONAL_ENABLED: "yes" }), true);
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
    MAILCHIMP_TRANSACTIONAL_API_KEY: "test-key",
    MAILCHIMP_SMS_FROM: "+16155550199",
    MAILCHIMP_SMS_PROMOTIONAL_ENABLED: "true",
  };

  it("posts one E.164 recipient to messages/send-sms", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return jsonResponse([
        { status: "sent", _id: "abc", to: "+16155550123", from: "+16155550199" },
      ]);
    };
    const result = await deliverSms(
      { to: "6155550123", body: "Hello from Fan Engage", ...smsSendClass("rsvp_confirmation") },
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
    const rejected = await deliverSms(
      { to: "+16155550123", body: "Hi", ...smsSendClass("redemption_fulfilled") },
      { env, fetchImpl },
    );
    assert.equal(rejected.ok, false);
    assert.equal(rejected.optOut, true);

    let called = false;
    const blocked: FetchLike = async () => {
      called = true;
      return jsonResponse([]);
    };
    const bad = await deliverSms(
      { to: "+16155550123", body: "Hi", ...smsSendClass("redemption_fulfilled") },
      { env: { ...env, MAILCHIMP_SMS_CONSENT: "marketing" }, fetchImpl: blocked },
    );
    assert.equal(bad.configured, false);
    assert.equal(called, false);
  });

  it("logs and skips the send when Mailchimp is not configured", async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return jsonResponse([]);
    };
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const result = await deliverSms(
        { to: "+16155550123", body: "Hi", ...smsSendClass("rsvp_confirmation") },
        { env: {}, fetchImpl },
      );
      assert.equal(result.ok, false);
      assert.equal(result.configured, false);
      assert.match(result.error ?? "", /Mailchimp SMS is not configured/);
      assert.match(warnings.join("\n"), /rsvp_confirmation send skipped/);
      assert.equal(called, false);
    } finally {
      console.warn = original;
    }
  });

  it("blocks promotional sends until the flag is set and still sends transactional ones", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      return jsonResponse([{ status: "sent", _id: "ok" }]);
    };
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    const quiet = {
      MAILCHIMP_TRANSACTIONAL_API_KEY: "test-key",
      MAILCHIMP_SMS_FROM: "+16155550199",
    };
    try {
      const blocked = await deliverSms(
        { to: "+16155550123", body: "Earn points", ...smsSendClass("welcome") },
        { env: quiet, fetchImpl },
      );
      assert.equal(blocked.ok, false);
      assert.equal(blocked.blocked, "promotional_disabled");
      assert.match(blocked.error ?? "", /MAILCHIMP_SMS_PROMOTIONAL_ENABLED is not set/);
      assert.match(warnings.join("\n"), /blocked promotional welcome/);
      const allowed = await deliverSms(
        { to: "+16155550123", body: "You're going", ...smsSendClass("rsvp_confirmation") },
        { env: quiet, fetchImpl },
      );
      assert.equal(allowed.ok, true);
      assert.equal(calls.length, 1);
      const opened = await deliverSms(
        { to: "+16155550123", body: "Earn points", ...smsSendClass("welcome") },
        { env: { ...quiet, MAILCHIMP_SMS_PROMOTIONAL_ENABLED: "true" }, fetchImpl },
      );
      assert.equal(opened.ok, true);
      assert.equal(calls.length, 2);
    } finally {
      console.warn = original;
    }
  });

  it("refuses a send whose kind does not match the classification", async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return jsonResponse([]);
    };
    const result = await deliverSms(
      { to: "+16155550123", body: "Hi", messageType: "welcome", messageKind: "transactional" },
      { env, fetchImpl },
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /does not match the classification/);
    assert.equal(called, false);
  });

  it("syncs opt-out and opt-in when the transactional key is set", async () => {
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

  it("opts a known fan out on STOP and does not reply or touch an unknown number", async () => {
    const store = directory(fans);
    const outcome = await handleInboundSms({
      from: "+1 (615) 555-0123",
      text: "STOP",
      directory: store,
      supportEmail: SUPPORT,
      now: NOW,
    });
    assert.equal(outcome.action, "stop");
    assert.equal(store.opted.get("fan-1"), false);
    assert.equal(outcome.providerOptIn, false);
    assert.equal(outcome.reply, null);
    assert.notEqual(outcome.reply, SMS_STOP_REPLY);

    const unknown = directory([]);
    const stranger = await handleInboundSms({
      from: "+16155550999",
      text: "STOPALL",
      directory: unknown,
      supportEmail: SUPPORT,
      now: NOW,
    });
    assert.equal(stranger.optedIn, null);
    assert.equal(stranger.providerOptIn, null);
    assert.equal(stranger.reply, null);
    assert.equal(unknown.opted.size, 0);
  });

  it("does not answer HELP unless keyword replies are explicitly on", async () => {
    const quiet = await handleInboundSms({
      from: "+16155550123",
      text: "HELP",
      directory: directory(fans),
      supportEmail: SUPPORT,
      now: NOW,
    });
    assert.equal(quiet.action, "help");
    assert.equal(quiet.optedIn, null);
    assert.equal(quiet.reply, null);

    const answered = await handleInboundSms({
      from: "+16155550123",
      text: "HELP",
      directory: directory(fans),
      supportEmail: SUPPORT,
      now: NOW,
      sendKeywordReplies: true,
    });
    assert.equal(answered.reply, smsHelpReply(SUPPORT));
    assert.equal(answered.providerOptIn, null);
  });

  it("opts an adult back in on START, ignores an unknown number, and refuses a known under-18", async () => {
    const adults = directory(fans);
    const back = await handleInboundSms({
      from: "+16155550123",
      text: "START",
      directory: adults,
      supportEmail: SUPPORT,
      now: NOW,
      sendKeywordReplies: true,
    });
    assert.equal(back.optedIn, true);
    assert.equal(adults.opted.get("fan-1"), true);
    assert.equal(back.providerOptIn, true);
    assert.equal(back.reply, SMS_START_REPLY);

    const silent = await handleInboundSms({
      from: "+16155550123",
      text: "START",
      directory: directory(fans),
      supportEmail: SUPPORT,
      now: NOW,
    });
    assert.equal(silent.optedIn, true);
    assert.equal(silent.reply, null);

    const stranger = await handleInboundSms({
      from: "+16155550999",
      text: "START",
      directory: directory([]),
      supportEmail: SUPPORT,
      now: NOW,
      sendKeywordReplies: true,
    });
    assert.equal(stranger.optedIn, null);
    assert.equal(stranger.providerOptIn, null);
    assert.equal(stranger.reply, null);
    assert.equal(stranger.fanId, null);

    const minors = directory([{ id: "kid", phone: "+16155550124", birthDate: UNDER_18 }]);
    const blocked = await handleInboundSms({
      from: "+16155550124",
      text: "START please",
      directory: minors,
      supportEmail: SUPPORT,
      now: NOW,
      sendKeywordReplies: true,
    });
    assert.equal(blocked.optedIn, null);
    assert.equal(blocked.underAge, true);
    assert.equal(blocked.providerOptIn, false);
    assert.equal(minors.opted.size, 0);
    assert.equal(blocked.reply, null);
    assert.notEqual(blocked.reply, AGE_ADULT_ONLY_MESSAGE);
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
    assert.deepEqual(messages, [
      {
        from: "+16155550123",
        to: null,
        text: "STOP",
        ts: null,
        eventId: null,
      },
    ]);
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
