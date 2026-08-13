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
