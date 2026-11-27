/**
 * Rows for the app_errors table (migration 0114).
 *
 * Pure: no "@/" imports, so plain `node --test` can load it. The insert
 * itself lives in lib/app-errors.ts.
 */
import { redactErrorText, safeErrorPath, type ClientErrorReport } from "./client-error-report.ts";

export type AppErrorRow = {
  source: "client" | "server";
  message: string;
  digest: string | null;
  path: string;
  route_path: string | null;
  route_type: string | null;
};

/**
 * Next.js throws these on purpose (redirect(), notFound(), a page that
 * reads cookies during a static build). They are not failures.
 */
const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

function shortText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

export function clientErrorRow(report: ClientErrorReport): AppErrorRow {
  return {
    source: "client",
    message: report.message || "Unknown error",
    digest: report.digest,
    path: report.path,
    route_path: null,
    route_type: null,
  };
}

/** A row for an error Next.js caught on the server, or null when it is not a real failure. */
export function serverErrorRow(
  err: unknown,
  request: { path?: unknown },
  context: { routePath?: unknown; routeType?: unknown },
): AppErrorRow | null {
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  const rawMessage = err instanceof Error ? err.message : String(err);
  if ((digest && CONTROL_FLOW.test(digest)) || CONTROL_FLOW.test(rawMessage)) return null;
  if (/Dynamic server usage/.test(rawMessage)) return null;

  return {
    source: "server",
    message: redactErrorText(rawMessage) || "Unknown error",
    digest: digest && /^[A-Za-z0-9-]{1,64}$/.test(digest) ? digest : null,
    path: safeErrorPath(typeof request?.path === "string" ? request.path : "/"),
    route_path: shortText(context?.routePath, 200),
    route_type: shortText(context?.routeType, 20),
  };
}
