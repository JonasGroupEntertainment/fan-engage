import Stripe from "stripe";

/**
 * Server-only Stripe client. Uses STRIPE_SECRET_KEY from env — test-mode
 * key today, live-mode at launch. Pinned to a specific API version so
 * SDK upgrades don't silently change behavior.
 *
 * NEVER import this from a client component. It's guarded by a runtime
 * throw if the key is missing rather than erroring at import time, so
 * the admin page can render a "key not set" message instead of crashing
 * the whole build.
 *
 * Singleton is cached on globalThis in development so Next.js hot-module
 * replacement doesn't create a new client on every file change.
 */

declare global {
  // eslint-disable-next-line no-var
  var __stripeClient: Stripe | undefined;
}

export function getStripe(): Stripe {
  if (globalThis.__stripeClient) return globalThis.__stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — configure it in Vercel env vars (Production + Preview).",
    );
  }
  const client = new Stripe(key, {
    // Pinned to the API version shipped with stripe@22. Update this pin
    // whenever the SDK is upgraded and the API version changes.
    apiVersion: "2026-03-25.dahlia",
    typescript: true,
    // Node's default http(s) agent frequently throws StripeConnectionError
    // on Vercel's serverless runtime (sockets aren't reliably reused across
    // invocations). The fetch-based client avoids this.
    httpClient: Stripe.createFetchHttpClient(),
    appInfo: {
      name: "Fan Engage",
      url: process.env.NEXT_PUBLIC_APP_URL ?? "https://fanengagepro.com",
    },
  });
  globalThis.__stripeClient = client;
  return client;
}

/** Convenience — return null if the key isn't set, rather than throwing.
 *  Useful for admin pages that want to render a "not configured" state. */
export function getStripeOrNull(): Stripe | null {
  try {
    return getStripe();
  } catch {
    return null;
  }
}
