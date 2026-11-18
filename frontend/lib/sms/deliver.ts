import { normalizePhoneE164 } from "../phone.ts";
import {
  MANDRILL_SMS_ALLOW_URL,
  MANDRILL_SMS_DENY_URL,
  MANDRILL_SMS_SEND_URL,
  type Env,
  type FetchLike,
  mailchimpSmsConsent,
  mailchimpSmsFrom,
  mailchimpTransactionalKey,
  postMandrill,
} from "./mandrill.ts";
import { withStopFooter } from "./policy.ts";

/**
 * Outbound SMS. `SMS_PROVIDER=mailchimp` uses Mailchimp Transactional
 * (one phone number per request). Unset, `twilio`, or any other value
 * stays on Twilio, so nothing changes until the setting is flipped
 * after a real test send.
 *
 * Transactional SMS is the API that can text one opted-in number from
 * code. Marketing SMS campaigns cannot: they send one body to an
 * audience or segment. The messages this app sends (welcome, event
 * match, reminders, admin blasts, notification copies) are composed
 * here and handed to Transactional. Several of those copies are
 * marketing. Do not flip the setting until the Mailchimp account owner
 * confirms the approved 10DLC program accepts them on Transactional.
 * https://mailchimp.com/developer/transactional/docs/transactional-sms/
 * https://mailchimp.com/developer/marketing/concepts/how-mailchimp-works/
 */

export type SmsProviderName = "twilio" | "mailchimp";

export type SmsDeliverResult = {
  ok: boolean;
  id: string | null;
  configured: boolean;
  /** Mailchimp rejected the number as unsubscribed. Callers clear the local flag. */
  optOut: boolean;
  error?: string;
};

export function smsProviderName(env: Env = process.env): SmsProviderName {
  return env.SMS_PROVIDER?.trim().toLowerCase() === "mailchimp" ? "mailchimp" : "twilio";
}

export function missingSmsProviderEnv(env: Env = process.env): string[] {
  if (smsProviderName(env) === "mailchimp") {
    const missing: string[] = [];
    if (!mailchimpTransactionalKey(env)) {
      missing.push("MAILCHIMP_TRANSACTIONAL_API_KEY or MANDRILL_API_KEY");
    }
    if (!mailchimpSmsFrom(env)) missing.push("MAILCHIMP_SMS_FROM");
    if (!mailchimpSmsConsent(env).ok) missing.push("MAILCHIMP_SMS_CONSENT");
    return missing;
  }
  const missing: string[] = [];
  if (!env.TWILIO_ACCOUNT_SID?.trim()) missing.push("TWILIO_ACCOUNT_SID");
  if (!env.TWILIO_AUTH_TOKEN?.trim()) missing.push("TWILIO_AUTH_TOKEN");
  if (!env.TWILIO_MESSAGING_SERVICE_SID?.trim() && !env.TWILIO_DEFAULT_FROM?.trim()) {
    missing.push("TWILIO_MESSAGING_SERVICE_SID or TWILIO_DEFAULT_FROM");
  }
  return missing;
}

export function smsConfigurationError(env: Env = process.env): string | null {
  const missing = missingSmsProviderEnv(env);
  if (missing.length === 0) return null;
  return smsProviderName(env) === "mailchimp"
    ? "Mailchimp SMS is not configured"
    : "Twilio not configured";
}

type SmsSendRow = {
  status?: string;
  _id?: string;
  reject_reason?: string | null;
};

function sendRow(json: unknown): SmsSendRow | null {
  if (Array.isArray(json)) {
    const first = json[0];
    return first && typeof first === "object" ? (first as SmsSendRow) : null;
  }
  if (json && typeof json === "object") return json as SmsSendRow;
  return null;
}

function recipientFor(provider: SmsProviderName, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (provider === "twilio") return trimmed;
  const normalized = normalizePhoneE164(trimmed);
  return normalized.ok ? normalized.phone : null;
}

async function sendViaTwilio(env: Env, to: string, body: string): Promise<SmsDeliverResult> {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const defaultFrom = env.TWILIO_DEFAULT_FROM?.trim();
  if (!accountSid || !authToken || (!messagingServiceSid && !defaultFrom)) {
    return { ok: false, id: null, configured: false, optOut: false, error: "Twilio not configured" };
  }
  const { default: twilio } = await import("twilio");
  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({
    to,
    body,
    ...(messagingServiceSid ? { messagingServiceSid } : { from: defaultFrom as string }),
  });
  return { ok: true, id: message.sid ?? null, configured: true, optOut: false };
}

async function sendViaMailchimp(
  env: Env,
  to: string,
  body: string,
  fetchImpl: FetchLike,
): Promise<SmsDeliverResult> {
  const key = mailchimpTransactionalKey(env);
  const from = mailchimpSmsFrom(env);
  const consent = mailchimpSmsConsent(env);
  if (!key || !from || !consent.ok) {
    return {
      ok: false,
      id: null,
      configured: false,
      optOut: false,
      error: "Mailchimp SMS is not configured",
    };
  }
  const posted = await postMandrill(
    MANDRILL_SMS_SEND_URL,
    {
      key,
      message: {
        sms: {
          text: body,
          to: [to],
          from,
          consent: consent.value,
        },
      },
    },
    fetchImpl,
    key,
  );
  if (!posted.ok) {
    return { ok: false, id: null, configured: true, optOut: false, error: posted.error };
  }
  const row = sendRow(posted.json);
  const status = row?.status ?? "";
  if (status === "sent" || status === "queued" || status === "scheduled") {
    return { ok: true, id: row?._id ?? null, configured: true, optOut: false };
  }
  const reason = row?.reject_reason ? ` (${row.reject_reason})` : "";
  return {
    ok: false,
    id: row?._id ?? null,
    configured: true,
    optOut: row?.reject_reason === "unsub",
    error: `Mailchimp SMS status ${status || "unknown"}${reason}`,
  };
}

export async function deliverSms(
  input: { to: string; body: string },
  options?: { env?: Env; fetchImpl?: FetchLike },
): Promise<SmsDeliverResult> {
  const env = options?.env ?? process.env;
  const provider = smsProviderName(env);
  const fetchImpl = options?.fetchImpl ?? fetch;
  if (smsConfigurationError(env)) {
    return {
      ok: false,
      id: null,
      configured: false,
      optOut: false,
      error: smsConfigurationError(env) ?? "SMS is not configured",
    };
  }
  const to = recipientFor(provider, input.to);
  if (!to) {
    return { ok: false, id: null, configured: true, optOut: false, error: "Phone number is not sendable" };
  }
  const body = withStopFooter(input.body);
  if (!body.trim()) {
    return { ok: false, id: null, configured: true, optOut: false, error: "SMS body is empty" };
  }
  try {
    if (provider === "mailchimp") return await sendViaMailchimp(env, to, body, fetchImpl);
    return await sendViaTwilio(env, to, body);
  } catch (err) {
    return {
      ok: false,
      id: null,
      configured: true,
      optOut: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Push a local opt-in change onto the Transactional denylist when
 * Mailchimp is the active provider. Twilio has no equivalent call.
 * Never throws: a denylist miss must not fail the fan's own save.
 */
export async function syncSmsOptInWithProvider(
  phone: string | null | undefined,
  optedIn: boolean,
  options?: { env?: Env; fetchImpl?: FetchLike },
): Promise<void> {
  const env = options?.env ?? process.env;
  if (smsProviderName(env) !== "mailchimp") return;
  const key = mailchimpTransactionalKey(env);
  const normalized = normalizePhoneE164(phone);
  if (!key || !normalized.ok || !normalized.phone) return;
  const url = optedIn ? MANDRILL_SMS_ALLOW_URL : MANDRILL_SMS_DENY_URL;
  const payload: Record<string, unknown> = { key, phone: normalized.phone };
  if (!optedIn) payload.comment = "Fan Engage opt-out";
  const posted = await postMandrill(url, payload, options?.fetchImpl ?? fetch, key);
  if (!posted.ok) {
    console.warn("Mailchimp SMS denylist sync failed", { optedIn, error: posted.error });
  }
}
