import { createHash, createHmac } from "node:crypto";
import { safeEqual, type Env, type FetchLike } from "./mandrill.ts";

/**
 * Fan Engage is the only inbound receiver for the shared 10DLC
 * +16152377488. After FEP handles a message, it forwards the same
 * event to Brand Engage Pro. Mailchimp allows one inbound route per
 * number. See docs/sms-mailchimp.md.
 */

/** Approved Jonas Group US 10DLC. Same number on Fan Engage and Brand Engage. */
export const SHARED_SMS_NUMBER = "+16152377488";

/** Brand Engage rejects a timestamp further than this from its clock. */
export const SMS_FORWARD_MAX_SKEW_MS = 5 * 60 * 1000;

const FORWARD_TIMEOUT_MS = 4_000;

export type SmsForwardEvent = {
  from: string;
  to: string;
  text: string;
  ts: string;
  event_id: string;
};

export function smsForwardSignature(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function smsForwardBody(event: SmsForwardEvent): string {
  return JSON.stringify({
    from: event.from,
    to: event.to,
    text: event.text,
    ts: event.ts,
    event_id: event.event_id,
  });
}

/**
 * True when Brand Engage should accept the POST. The signature is the
 * hex HMAC-SHA256 of the raw body only. The timestamp header is checked
 * separately and rejected when it is missing or more than five minutes
 * off.
 */
export function smsForwardAccepted(input: {
  secret: string;
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  now?: Date;
  maxSkewMs?: number;
}): boolean {
  const signature = input.signatureHeader?.trim() ?? "";
  const timestamp = input.timestampHeader?.trim() ?? "";
  if (!input.secret || !signature || !timestamp) return false;
  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt)) return false;
  const skew = Math.abs((input.now ?? new Date()).getTime() - sentAt);
  if (skew > (input.maxSkewMs ?? SMS_FORWARD_MAX_SKEW_MS)) return false;
  return safeEqual(signature, smsForwardSignature(input.secret, input.rawBody));
}

export function smsForwardEventId(parts: {
  from: string;
  to: string;
  text: string;
  ts: string;
  eventId?: string | null;
}): string {
  const provided = parts.eventId?.trim();
  if (provided) return provided;
  return createHash("sha256")
    .update(`${parts.from}|${parts.to}|${parts.text}|${parts.ts}`)
    .digest("hex");
}

export function buildSmsForwardEvent(
  input: {
    from: string;
    to: string | null;
    text: string;
    ts: string | null;
    eventId: string | null;
  },
  options?: { env?: Env; now?: Date },
): SmsForwardEvent {
  const env = options?.env ?? process.env;
  const now = options?.now ?? new Date();
  const to =
    input.to ??
    env.MAILCHIMP_SMS_FROM?.trim() ??
    SHARED_SMS_NUMBER;
  const ts = input.ts ?? now.toISOString();
  return {
    from: input.from,
    to,
    text: input.text,
    ts,
    event_id: smsForwardEventId({
      from: input.from,
      to,
      text: input.text,
      ts,
      eventId: input.eventId,
    }),
  };
}

/**
 * Best-effort POST. Skips when BEP_SMS_FORWARD_URL or SMS_FORWARD_SECRET
 * is unset. Logs failures. Never throws.
 */
export async function forwardInboundSms(
  event: SmsForwardEvent,
  options?: { env?: Env; fetchImpl?: FetchLike; now?: Date },
): Promise<void> {
  const env = options?.env ?? process.env;
  const url = env.BEP_SMS_FORWARD_URL?.trim() ?? "";
  const secret = env.SMS_FORWARD_SECRET?.trim() ?? "";
  if (!url || !secret) return;
  const rawBody = smsForwardBody(event);
  const timestamp = (options?.now ?? new Date()).toISOString();
  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SMS-Forward-Signature": smsForwardSignature(secret, rawBody),
        "X-SMS-Forward-Timestamp": timestamp,
      },
      body: rawBody,
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(
        `SMS forward to Brand Engage Pro failed (${event.event_id}) status ${response.status}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`SMS forward to Brand Engage Pro failed (${event.event_id}): ${message}`);
  }
}
