import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { hasSentryDsn, isNextControlFlowError } from "@/lib/sentry-report";

/**
 * Optional Sentry. With no DSN this file does not initialize the SDK.
 * Source maps are not uploaded: next.config is not wrapped with
 * withSentryConfig, so the build does not need SENTRY_AUTH_TOKEN.
 */
export async function register() {
  if (!hasSentryDsn()) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  if (!hasSentryDsn()) return;
  if (isNextControlFlowError(error)) return;
  Sentry.captureRequestError(error, request, context);
};
