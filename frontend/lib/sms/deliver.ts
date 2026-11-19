import { normalizePhoneE164 } from "../phone.ts";
import { smsMessageKind, type SmsMessageKind, type SmsMessageType } from "./kinds.ts";
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
 * Outbound SMS. Mailchimp Transactional
 * (POST https://mandrillapp.com/api/1.4/messages/send-sms) is the only
 * sender. One phone number per request. A missing key or from-number
 * is logged and returned as a failed send. It does not throw.
 *
 * Transactional SMS is what Mailchimp documents for non-promotional
 * messages. Promotional message types are refused until
 * MAILCHIMP_SMS_PROMOTIONAL_ENABLED is set. sendPromotionalSms is the
 * only function a future Marketing-campaign implementation replaces.
 * Callers keep passing messageType and messageKind.
 *
 * https://mailchimp.com/developer/transactional/docs/transactional-sms/
 * https://mailchimp.com/developer/transactional/api/messages/send-sms
 */

export type SmsDeliverResult = {
  ok: boolean;
  id: string | null;
  configured: boolean;
  /** Mailchimp rejected the number as unsubscribed. Callers clear the local flag. */
  optOut: boolean;
  /** Set when the promotional gate refused the send. */
  blocked?: "promotional_disabled";
  error?: string;
};

export type SmsSendInput = {
  to: string;
  body: string;
  messageType: SmsMessageType;
  messageKind: SmsMessageKind;
};

export function promotionalSmsEnabled(env: Env = process.env): boolean {
  const raw = env.MAILCHIMP_SMS_PROMOTIONAL_ENABLED?.trim().toLowerCase() ?? "";
  return raw === "true" || raw === "1" || raw === "yes";
}

export function missingSmsProviderEnv(env: Env = process.env): string[] {
  const missing: string[] = [];
  if (!mailchimpTransactionalKey(env)) {
    missing.push("MAILCHIMP_TRANSACTIONAL_API_KEY or MANDRILL_API_KEY");
  }
  if (!mailchimpSmsFrom(env)) missing.push("MAILCHIMP_SMS_FROM");
  if (!mailchimpSmsConsent(env).ok) missing.push("MAILCHIMP_SMS_CONSENT");
  return missing;
}

export function smsConfigurationError(env: Env = process.env): string | null {
  const missing = missingSmsProviderEnv(env);
  if (missing.length === 0) return null;
  return "Mailchimp SMS is not configured";
}

/**
 * Why this send must not leave the process, or null when it may.
 * The promotional line is the one to grep for when the flag is still off.
 */
export function smsBlockReason(
  input: Pick<SmsSendInput, "messageType" | "messageKind">,
  env: Env = process.env,
): { error: string; configured: boolean; blocked?: "promotional_disabled" } | null {
  if (input.messageKind !== smsMessageKind(input.messageType)) {
    return {
      configured: true,
      error: `Mailchimp SMS refused ${input.messageType}: messageKind ${input.messageKind} does not match the classification`,
    };
  }
  const missing = missingSmsProviderEnv(env);
  if (missing.length > 0) {
    return {
      configured: false,
      error: `Mailchimp SMS is not configured; ${input.messageType} send skipped (${missing.join(", ")})`,
    };
  }
  if (input.messageKind === "promotional" && !promotionalSmsEnabled(env)) {
    return {
      configured: true,
      blocked: "promotional_disabled",
      error: `Mailchimp SMS blocked promotional ${input.messageType}: MAILCHIMP_SMS_PROMOTIONAL_ENABLED is not set`,
    };
  }
  return null;
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

function recipientFor(raw: string): string | null {
  const normalized = normalizePhoneE164(raw);
  return normalized.ok ? normalized.phone : null;
}

async function postSendSms(
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

/** Non-promotional texts. This is the Transactional SMS call. */
async function sendTransactionalSms(
  env: Env,
  to: string,
  body: string,
  fetchImpl: FetchLike,
): Promise<SmsDeliverResult> {
  return postSendSms(env, to, body, fetchImpl);
}

/**
 * Promotional texts. Reached only after MAILCHIMP_SMS_PROMOTIONAL_ENABLED
 * is set. Still Transactional SMS today. Replace this function to send
 * a Marketing campaign instead. Callers do not change.
 */
async function sendPromotionalSms(
  env: Env,
  to: string,
  body: string,
  fetchImpl: FetchLike,
): Promise<SmsDeliverResult> {
  return sendTransactionalSms(env, to, body, fetchImpl);
}

export async function deliverSms(
  input: SmsSendInput,
  options?: { env?: Env; fetchImpl?: FetchLike },
): Promise<SmsDeliverResult> {
  const env = options?.env ?? process.env;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const blocked = smsBlockReason(input, env);
  if (blocked) {
    console.warn(blocked.error);
    return {
      ok: false,
      id: null,
      configured: blocked.configured,
      optOut: false,
      blocked: blocked.blocked,
      error: blocked.error,
    };
  }
  const to = recipientFor(input.to);
  if (!to) {
    return { ok: false, id: null, configured: true, optOut: false, error: "Phone number is not sendable" };
  }
  const body = withStopFooter(input.body);
  if (!body.trim()) {
    return { ok: false, id: null, configured: true, optOut: false, error: "SMS body is empty" };
  }
  try {
    if (input.messageKind === "promotional") {
      return await sendPromotionalSms(env, to, body, fetchImpl);
    }
    return await sendTransactionalSms(env, to, body, fetchImpl);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn(`Mailchimp SMS ${input.messageType} send failed`, error);
    return { ok: false, id: null, configured: true, optOut: false, error };
  }
}

/**
 * Push a local opt-in change onto the Transactional denylist.
 * Never throws: a denylist miss must not fail the fan's own save.
 * Skips when the transactional key is unset or the phone is not E.164.
 */
export async function syncSmsOptInWithProvider(
  phone: string | null | undefined,
  optedIn: boolean,
  options?: { env?: Env; fetchImpl?: FetchLike },
): Promise<void> {
  try {
    const env = options?.env ?? process.env;
    const key = mailchimpTransactionalKey(env);
    const normalized = normalizePhoneE164(phone);
    if (!key || !normalized.ok || !normalized.phone) {
      if (!key) console.warn("Mailchimp SMS denylist sync skipped; transactional key is not set");
      return;
    }
    const url = optedIn ? MANDRILL_SMS_ALLOW_URL : MANDRILL_SMS_DENY_URL;
    const payload: Record<string, unknown> = { key, phone: normalized.phone };
    if (!optedIn) payload.comment = "Fan Engage opt-out";
    const posted = await postMandrill(url, payload, options?.fetchImpl ?? fetch, key);
    if (!posted.ok) {
      console.warn("Mailchimp SMS denylist sync failed", { optedIn, error: posted.error });
    }
  } catch (err) {
    console.warn(
      "Mailchimp SMS denylist sync failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}
