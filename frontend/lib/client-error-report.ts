/**
 * A short, privacy-safe line about an error a fan's browser hit
 *. app/error.tsx and
 * app/global-error.tsx send one to /api/client-error, which writes it to
 * the server log (Vercel runtime logs), so problems that only happen in
 * fans' browsers stop being invisible.
 *
 * Only the error message (with anything that looks like an email address,
 * a long number or a token blanked out), the Next.js error digest and the
 * page path (no query string) are kept. Never the fan, never the URL's
 * query, never form data.
 *
 * Pure: no "@/" imports, so plain `node --test` can load it.
 */

export type ClientErrorReport = {
  message: string;
  digest: string | null;
  path: string;
};

const MAX_MESSAGE = 300;
const MAX_PATH = 200;
const MAX_BODY = 2000;

/** Blanks out what could identify someone or unlock something. */
export function redactErrorText(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]")
    .replace(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g, "[number]")
    // Database messages quote the stored value: Key (column)=(value).
    .replace(/\)=\([^)]*\)/g, ")=([value])")
    .replace(/\d{7,}/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE);
}

/** Pages whose address names one fan, an invite code or a shared item. */
const PRIVATE_SEGMENTS: ReadonlyArray<[RegExp, string]> = [
  [/^\/fans\/[^/]+/, "/fans/[fan]"],
  [/^\/invite\/[^/]+/, "/invite/[code]"],
  [/^\/share\/([^/]+)\/[^/]+/, "/share/$1/[id]"],
];

/** Path only: no query string, no fragment, nothing that names a fan, capped. */
export function safeErrorPath(raw: string): string {
  const path = raw.split(/[?#]/)[0] || "/";
  if (!path.startsWith("/")) return "/";
  const masked = PRIVATE_SEGMENTS.reduce((value, [pattern, to]) => value.replace(pattern, to), path);
  return masked.slice(0, MAX_PATH);
}

/** Built in the browser from the error the boundary caught. */
export function buildClientErrorReport(input: {
  message: unknown;
  digest?: unknown;
  path: unknown;
}): ClientErrorReport {
  const digest = typeof input.digest === "string" && /^[A-Za-z0-9-]{1,64}$/.test(input.digest) ? input.digest : null;
  return {
    message: redactErrorText(typeof input.message === "string" ? input.message : "Unknown error"),
    digest,
    path: safeErrorPath(typeof input.path === "string" ? input.path : "/"),
  };
}

/** Read on the server. Anything malformed or oversized is dropped (null). */
export function parseClientErrorReport(raw: unknown): ClientErrorReport | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > MAX_BODY) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const { message, digest, path } = value as Record<string, unknown>;
  if (typeof message !== "string" || typeof path !== "string") return null;
  // Rebuild rather than trust: the server applies the same redaction.
  return buildClientErrorReport({ message, digest, path });
}
