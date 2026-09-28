/**
 * Stripe webhook idempotency helpers.
 *
 * stripe_events.processed_at means "handler succeeded." Failed attempts
 * keep processed_at null so Stripe retries re-run the handler. True
 * successes stay replay no-ops.
 */

export type StripeEventCompletionPatch = {
  processed_at: string | null;
  error: string | null;
};

export function isStripeEventReplay(
  processedAt: string | null | undefined,
): boolean {
  return Boolean(processedAt);
}

export function stripeEventCompletionPatch(
  processError: string | null,
  now: Date = new Date(),
): StripeEventCompletionPatch {
  if (processError) {
    return { processed_at: null, error: processError };
  }
  return { processed_at: now.toISOString(), error: null };
}

type DbError = { code?: string; message: string } | null | undefined;

/** Postgres unique_violation: a concurrent delivery logged the event first. */
const UNIQUE_VIOLATION = "23505";

export type StripeEventInsertOutcome = "recorded" | "duplicate" | "failed";

/**
 * Result of logging an event on arrival. Anything other than success or a
 * duplicate key means we cannot track the event, so the route should
 * return 500 and let Stripe retry instead of processing it untracked.
 */
export function stripeEventInsertOutcome(error: DbError): StripeEventInsertOutcome {
  if (!error) return "recorded";
  if (error.code === UNIQUE_VIOLATION) return "duplicate";
  return "failed";
}

/**
 * Throws when a Supabase write failed, so the handler fails, the event
 * keeps processed_at null, and Stripe retries.
 */
export function throwIfDbError(result: { error: DbError }, label: string): void {
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
}

export const MONTHLY_CREDIT_CENTS = 500;

/**
 * credit_grants row for the monthly refresh. stripe_event_id references
 * stripe_events(id), so it must be the Stripe event id, never the invoice id.
 */
export function monthlyCreditGrantRow(input: {
  fanId: string;
  communityId: string;
  eventId: string;
}) {
  return {
    fan_id: input.fanId,
    community_id: input.communityId,
    amount_cents: MONTHLY_CREDIT_CENTS,
    reason: "monthly_refresh",
    stripe_event_id: input.eventId,
  };
}
