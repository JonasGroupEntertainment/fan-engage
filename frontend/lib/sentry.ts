import * as Sentry from "@sentry/nextjs";
import { hasSentryDsn, reportableError, sentryTags, type SentryTagInput } from "./sentry-report.ts";

/**
 * Report a server failure. No-op when SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN
 * are both unset, so local builds and deploys without Sentry keep working.
 * Awaited flush matters on Vercel: the isolate can freeze after the response.
 */
export async function captureAppException(error: unknown, tags: SentryTagInput): Promise<void> {
  if (!hasSentryDsn()) return;
  try {
    Sentry.captureException(reportableError(error), { tags: sentryTags(tags) });
    await Sentry.flush(2_000);
  } catch {
    // Reporting must not change the request outcome.
  }
}
