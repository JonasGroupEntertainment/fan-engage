import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhoneE164 } from "../phone.ts";

/**
 * Mailchimp Transactional SMS.
 *
 * Send: POST https://mandrillapp.com/api/1.4/messages/send-sms
 *   Auth is the Transactional API key in the JSON body (`key`), not a
 *   bearer header. The reference lists API 1.4; the getting-started guide
 *   still shows 1.1. This client follows the reference.
 *   https://mailchimp.com/developer/transactional/api/messages/send-sms
 *   https://mailchimp.com/developer/transactional/guides/send-first-sms/
 *
 * Opt-out denylist:
 *   POST https://mandrillapp.com/api/1.4/rejects/add-sms
 *   POST https://mandrillapp.com/api/1.4/rejects/delete-sms
 *   https://mailchimp.com/developer/transactional/docs/transactional-sms/
 *
 * Webhooks are form-encoded `mandrill_events` and signed with
 * X-Mandrill-Signature (HMAC-SHA1 of the exact webhook URL plus each
 * sorted POST key and value, base64). Each webhook has its own key.
 * The inbound route from inbound/add-route is signed with that route's
 * key. The events webhook is signed with its own auth_key. A URL-check
 * POST sends an empty array signed with the literal key "test-webhook".
 *   https://mailchimp.com/developer/transactional/guides/track-respond-activity-webhooks/
 *   https://mailchimp.com/developer/transactional/docs/webhooks/
 */

export const MANDRILL_SMS_SEND_URL = "https://mandrillapp.com/api/1.4/messages/send-sms";
export const MANDRILL_SMS_DENY_URL = "https://mandrillapp.com/api/1.4/rejects/add-sms";
export const MANDRILL_SMS_ALLOW_URL = "https://mandrillapp.com/api/1.4/rejects/delete-sms";

export const MANDRILL_URL_CHECK_KEY = "test-webhook";

export const SMS_CONSENT_VALUES = ["onetime", "recurring", "recurring-no-confirm"] as const;
export type SmsConsent = (typeof SMS_CONSENT_VALUES)[number];

export type Env = Record<string, string | undefined>;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const PHONE_KEY = /phone|sms|^to$|^from$|^sender$|^reject$/i;

export function mailchimpTransactionalKey(env: Env): string | null {
  const dedicated = env.MAILCHIMP_TRANSACTIONAL_API_KEY?.trim();
  if (dedicated) return dedicated;
  const shared = env.MANDRILL_API_KEY?.trim();
  return shared || null;
}

export function mailchimpSmsFrom(env: Env): string | null {
  const raw = env.MAILCHIMP_SMS_FROM?.trim();
  if (!raw) return null;
  const normalized = normalizePhoneE164(raw);
  return normalized.ok ? normalized.phone : null;
}

/** Unset means recurring-no-confirm: consent is already on the fan row. */
export function mailchimpSmsConsent(env: Env): { ok: true; value: SmsConsent } | { ok: false } {
  const raw = env.MAILCHIMP_SMS_CONSENT?.trim();
  if (!raw) return { ok: true, value: "recurring-no-confirm" };
  if ((SMS_CONSENT_VALUES as readonly string[]).includes(raw)) {
    return { ok: true, value: raw as SmsConsent };
  }
  return { ok: false };
}

/**
 * Off unless set to true. Mailchimp auto-answers HELP and STOP on
 * 10DLC, so a second reply is a duplicate. STOP is never answered
 * by this app even when this is true.
 */
export function keywordRepliesEnabled(env: Env): boolean {
  return env.MAILCHIMP_SMS_SEND_KEYWORD_REPLIES?.trim().toLowerCase() === "true";
}

export type MailchimpSmsWebhookKind = "inbound" | "events";

/** Comma-separated keys. Blank pieces are dropped. */
export function splitMailchimpWebhookKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Keys that may sign this endpoint.
 *
 * The inbound route and the events webhook each have their own key.
 * When that var is unset or blank, MAILCHIMP_SMS_WEBHOOK_KEY is used.
 * A value may list several keys, separated by commas, so a key can be
 * rotated without downtime. Any one of them is accepted.
 */
export function mailchimpSmsWebhookKeys(env: Env, kind: MailchimpSmsWebhookKind): string[] {
  const dedicated =
    kind === "inbound" ? env.MAILCHIMP_SMS_INBOUND_WEBHOOK_KEY : env.MAILCHIMP_SMS_EVENTS_WEBHOOK_KEY;
  const chosen = dedicated?.trim() ? dedicated : env.MAILCHIMP_SMS_WEBHOOK_KEY;
  return splitMailchimpWebhookKeys(chosen);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Documented Mandrill webhook signature. Keys are sorted. */
export function mandrillWebhookSignature(
  webhookKey: string,
  url: string,
  params: Record<string, string>,
): string {
  const signed = Object.keys(params)
    .sort()
    .reduce((data, key) => data + key + params[key], url);
  return createHmac("sha1", webhookKey).update(signed).digest("base64");
}

export async function readFormParams(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !(key in params)) params[key] = value;
  }
  return params;
}

export function parseMandrillEvents(raw: string | undefined): unknown[] {
  if (!raw || !raw.trim()) return [];
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

export function mandrillEventsAreEmpty(raw: string | undefined): boolean {
  try {
    return parseMandrillEvents(raw).length === 0;
  } catch {
    return false;
  }
}

function configuredWebhookKeys(input: {
  webhookKey?: string | null;
  webhookKeys?: readonly string[] | null;
}): string[] {
  const pieces = [input.webhookKey, ...(input.webhookKeys ?? [])].filter(
    (key): key is string => typeof key === "string",
  );
  return splitMailchimpWebhookKeys(pieces.join(","));
}

/**
 * Fail closed for real events. An empty `mandrill_events` array is
 * Mailchimp's URL check and is signed with "test-webhook", including
 * when no webhook key is configured. A non-empty batch needs one of
 * the configured keys. `webhookKey` and `webhookKeys` may each be a
 * comma-separated list.
 */
export function mandrillWebhookAuthorized(input: {
  header: string | null;
  url: string;
  params: Record<string, string>;
  webhookKey?: string | null;
  webhookKeys?: readonly string[] | null;
}): boolean {
  const header = input.header?.trim() ?? "";
  if (!header) return false;
  const configured = configuredWebhookKeys(input);
  const keys = mandrillEventsAreEmpty(input.params.mandrill_events)
    ? [MANDRILL_URL_CHECK_KEY, ...configured]
    : configured;
  if (keys.length === 0) return false;
  return keys.some((key) => safeEqual(header, mandrillWebhookSignature(key, input.url, input.params)));
}

/** Signature check for one SMS endpoint, using that endpoint's keys. */
export function mailchimpSmsPostAuthorized(
  kind: MailchimpSmsWebhookKind,
  input: {
    header: string | null;
    url: string;
    params: Record<string, string>;
  },
  env: Env,
): boolean {
  return mandrillWebhookAuthorized({
    ...input,
    webhookKeys: mailchimpSmsWebhookKeys(env, kind),
  });
}

export type InboundText = {
  from: string;
  to: string | null;
  text: string;
  ts: string | null;
  eventId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function phoneFromValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizePhoneE164(value);
  return normalized.ok ? normalized.phone : null;
}

function phonesUnderPhoneKeys(value: unknown, into: string[], depth = 0, key = ""): void {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    if (PHONE_KEY.test(key)) {
      const phone = phoneFromValue(value);
      if (phone) into.push(phone);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) phonesUnderPhoneKeys(item, into, depth + 1, key);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [childKey, child] of Object.entries(record)) {
    if (/email/i.test(childKey)) continue;
    phonesUnderPhoneKeys(child, into, depth + 1, childKey);
  }
}

function uniquePhones(value: unknown): string[] {
  const found: string[] = [];
  phonesUnderPhoneKeys(value, found);
  return [...new Set(found)];
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function textFromMessage(message: Record<string, unknown>): string | null {
  for (const key of ["text", "body"]) {
    const value = message[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const sms = asRecord(message.sms);
  if (sms && typeof sms.text === "string" && sms.text.trim()) return sms.text.trim();
  return null;
}

function phoneFromMessage(message: Record<string, unknown>): string | null {
  for (const key of ["from_phone", "from", "phone", "sender"]) {
    const phone = phoneFromValue(message[key]);
    if (phone) return phone;
  }
  const sms = asRecord(message.sms);
  if (!sms) return null;
  for (const key of ["from_phone", "from", "phone", "sender"]) {
    const phone = phoneFromValue(sms[key]);
    if (phone) return phone;
  }
  return null;
}

/**
 * Inbound route payloads. The published inbound example is for email
 * (`event: "inbound"`, `msg.text`). SMS routes use the same webhook
 * envelope, so a dedicated inbound URL accepts any event that carries
 * a sender phone and message text.
 */
function destinationFromMessage(message: Record<string, unknown>): string | null {
  for (const key of ["to_phone", "to", "recipient"]) {
    const phone = phoneFromValue(message[key]);
    if (phone) return phone;
  }
  const sms = asRecord(message.sms);
  if (!sms) return null;
  for (const key of ["to_phone", "to", "recipient"]) {
    const phone = phoneFromValue(sms[key]);
    if (phone) return phone;
  }
  return null;
}

export function inboundTexts(events: unknown[]): InboundText[] {
  const out: InboundText[] = [];
  for (const event of events) {
    const record = asRecord(event);
    if (!record) continue;
    const message = asRecord(record.msg) ?? record;
    const text = textFromMessage(message);
    const from = phoneFromMessage(message);
    if (!text || !from) continue;
    const to = destinationFromMessage(message);
    out.push({
      from,
      to: to && to !== from ? to : null,
      text,
      ts: stringField(message, ["ts", "timestamp", "date"]) ?? stringField(record, ["ts", "timestamp", "date"]),
      eventId:
        stringField(message, ["_id", "id", "event_id"]) ??
        stringField(record, ["_id", "id", "event_id"]),
    });
  }
  return out;
}

function channelOf(record: Record<string, unknown>): string {
  if (typeof record.channel === "string") return record.channel.toLowerCase();
  const message = asRecord(record.msg);
  if (message && typeof message.channel === "string") return message.channel.toLowerCase();
  return "";
}

function rejectReason(record: Record<string, unknown>): string {
  if (typeof record.reject_reason === "string") return record.reject_reason;
  const message = asRecord(record.msg);
  if (message && typeof message.reject_reason === "string") return message.reject_reason;
  return "";
}

/**
 * Phones to mark opted out. Email unsubscribes are ignored: Mailchimp
 * stores email and SMS consent separately. A denylist sync counts only
 * when a phone field is present, because the published sync schema names
 * `reject` without showing whether it holds an email or a phone.
 */
export function transactionalOptOutPhones(events: unknown[]): string[] {
  const phones: string[] = [];
  for (const event of events) {
    const record = asRecord(event);
    if (!record) continue;
    const name = typeof record.event === "string" ? record.event : "";
    const type = typeof record.type === "string" ? record.type : "";
    const action = typeof record.action === "string" ? record.action : "";
    const channel = channelOf(record);
    if (name === "unsub" && channel !== "email") {
      const found = uniquePhones(record);
      if (channel === "sms" || found.length > 0) phones.push(...found);
      continue;
    }
    if (name === "reject" && channel === "sms" && rejectReason(record) === "unsub") {
      phones.push(...uniquePhones(record));
      continue;
    }
    if ((type === "denylist" || type === "blacklist") && action === "add") {
      phones.push(...uniquePhones(record));
    }
  }
  return [...new Set(phones)];
}

/**
 * Marketing audience webhook. Only the documented SMS event opts a phone
 * out. An email `unsubscribe` must not clear SMS consent.
 * https://mailchimp.com/developer/marketing/api/lists/webhooks/create-webhook
 * https://mailchimp.com/help/about-webhooks/
 */
export function marketingSmsOptOutPhone(params: Record<string, string>): string | null {
  if (params.type !== "sms_unsubscribe") return null;
  const keys = Object.keys(params)
    .filter((key) => /phone|sms/i.test(key) && key !== "type")
    .sort();
  for (const key of keys) {
    const phone = phoneFromValue(params[key]);
    if (phone) return phone;
  }
  return null;
}

export function clipMailchimpError(body: string, key: string): string {
  return body.replaceAll(key, "[redacted]").slice(0, 200);
}

export async function postMandrill(
  url: string,
  payload: Record<string, unknown>,
  fetchImpl: FetchLike,
  key: string,
): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `Mailchimp SMS ${response.status}: ${clipMailchimpError(text, key)}` };
    }
    if (!text.trim()) return { ok: true, json: null };
    try {
      return { ok: true, json: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, error: "Mailchimp SMS returned a non-JSON body" };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
