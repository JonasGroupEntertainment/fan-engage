"use client";

import { buildClientErrorReport } from "./client-error-report";

/** Sends a privacy-safe error line to /api/client-error. Never throws. */
export function reportClientError(error: { message?: string; digest?: string }): void {
  try {
    const report = buildClientErrorReport({
      message: error?.message,
      digest: error?.digest,
      path: typeof window !== "undefined" ? window.location.pathname : "/",
    });
    const body = JSON.stringify(report);
    const sent =
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/client-error", new Blob([body], { type: "text/plain" }));
    if (!sent) {
      void fetch("/api/client-error", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
  } catch {
    // Reporting must never make an error page worse.
  }
}
