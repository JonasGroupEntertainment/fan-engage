import * as Sentry from "@sentry/nextjs";
import { clientSentryDsn, scrubPii, scrubSentryEvent, serverSentryDsn, type ScrubbableSentryEvent } from "./sentry-report.ts";

/**
 * Error tracking only. Tracing and session replay stay off.
 * A missing DSN skips init; captureException is then a no-op.
 */
export function initSentry(runtime: "server" | "client"): void {
  const dsn = runtime === "client" ? clientSentryDsn() : serverSentryDsn();
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      // SDK defaults collect bodies, cookies, headers, and local variables.
      // Keep only the exception, the stack, and the tags we set ourselves.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
        databaseQueryData: false,
        queues: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
      },
      beforeSend(event) {
        return scrubSentryEvent(event as ScrubbableSentryEvent) as typeof event;
      },
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === "console") return null;
        const next = { ...breadcrumb };
        delete next.data;
        if (next.message) next.message = scrubPii(next.message);
        return next;
      },
    });
  } catch {
    console.error("[sentry] init failed");
  }
}
