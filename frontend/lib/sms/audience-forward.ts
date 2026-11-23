import { buildSmsForwardEvent, forwardInboundSms } from "./forward.ts";
import { marketingSmsOptOutPhone, type Env, type FetchLike } from "./mandrill.ts";

/**
 * Marketing audience SMS unsubscribes never hit the Mandrill inbound
 * route, so Brand Engage would not see them. This forwards a signed
 * STOP that Brand Engage's inbound-forward already accepts
 * (`text` is the message). See docs/sms-mailchimp.md.
 */

/** Keyword Brand Engage already treats as an opt-out. */
export const AUDIENCE_SMS_OPT_OUT_TEXT = "STOP";

/** Brand Engage rejects `ts` longer than this. */
const AUDIENCE_FORWARD_TS_MAX = 40;

export type AudienceSmsForwardOptions = {
  env?: Env;
  fetchImpl?: FetchLike;
  now?: Date;
};

function audienceForwardTs(firedAt: string | undefined): string | null {
  const trimmed = firedAt?.trim() ?? "";
  if (!trimmed || trimmed.length > AUDIENCE_FORWARD_TS_MAX) return null;
  return trimmed;
}

/**
 * Best-effort signed STOP. Skips when the forward env is unset.
 * Logs and swallows failures, including an unexpected throw from the
 * shared forward helper.
 */
export async function forwardMarketingSmsUnsubscribe(
  phone: string,
  params: Record<string, string>,
  options?: AudienceSmsForwardOptions,
): Promise<void> {
  const env = options?.env ?? process.env;
  const now = options?.now ?? new Date();
  const event = buildSmsForwardEvent(
    {
      from: phone,
      to: null,
      text: AUDIENCE_SMS_OPT_OUT_TEXT,
      ts: audienceForwardTs(params.fired_at),
      eventId: null,
    },
    { env, now },
  );
  try {
    await forwardInboundSms(event, {
      env,
      fetchImpl: options?.fetchImpl,
      now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`SMS forward to Brand Engage Pro failed (${event.event_id}): ${message}`);
  }
}

/**
 * Apply one Marketing audience post. SMS unsubscribes opt the phone out
 * in Fan Engage, then forward STOP. Any other event is a no-op.
 * A forward failure does not change the result of Fan Engage's opt-out.
 */
export async function handleMarketingAudienceSms(
  input: {
    params: Record<string, string>;
    optOutLocally: (phone: string) => Promise<void>;
  } & AudienceSmsForwardOptions,
): Promise<"ok" | "error"> {
  const phone = marketingSmsOptOutPhone(input.params);
  if (!phone) return "ok";

  let failed = false;
  try {
    await input.optOutLocally(phone);
  } catch (err) {
    failed = true;
    console.error("Mailchimp audience SMS opt-out failed", err);
  }

  await forwardMarketingSmsUnsubscribe(phone, input.params, {
    env: input.env,
    fetchImpl: input.fetchImpl,
    now: input.now,
  });

  return failed ? "error" : "ok";
}
