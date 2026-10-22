/**
 * Log line for a failed Stripe webhook signature check.
 *
 * The body has not been authenticated, so the event type is unknown.
 * The returned text never includes the signing secret, the
 * stripe-signature header, or any payload bytes — including when the
 * thrown error happens to contain them.
 */

const SECRET_MISMATCH =
  "No signatures found matching the expected signature for payload";

export function stripeSignatureFailureWarning(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  const detail = message.includes(SECRET_MISMATCH)
    ? "signing secret does not match this endpoint"
    : "signature rejected";
  return `stripe/webhook: signature verification failed (event type unknown; ${detail})`;
}
