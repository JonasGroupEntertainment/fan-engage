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

/**
 * Server errors are kept in the app's own database (app_errors, migration
 * 0114) for 90 days and read on /admin/errors. Sentry, when it is set up,
 * still gets them too.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (hasSentryDsn() && !isNextControlFlowError(error)) {
    Sentry.captureRequestError(error, request, context);
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { serverErrorRow } = await import("./lib/app-error-row");
    const row = serverErrorRow(error, request, context);
    if (!row) return;
    const { recordAppError } = await import("./lib/app-errors");
    await recordAppError(row);
  } catch {
    // Recording must never cause another error.
  }
};
