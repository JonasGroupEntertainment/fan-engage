/**
 * Pure helpers for optional Sentry reporting.
 * No SDK import: this module is safe to load when Sentry is not configured.
 * Tags are route, step, and (when it is a fan uuid) fan id. Emails, phones,
 * and secret-shaped strings are stripped from messages before they are sent.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+\d{10,15}/g;
const SECRET_RE = /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

const FAN_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE_RE = /^\/[A-Za-z0-9/_.-]{1,120}$/;
const STEP_RE = /^[a-z0-9-]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

const CONTROL_FLOW_DIGESTS = [
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  "NEXT_PRERENDER_INTERRUPTED",
  "DYNAMIC_SERVER_USAGE",
  "HANGING_PROMISE_REJECTION",
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
] as const;

const SENSITIVE_HEADER =
  /^(cookie|authorization|proxy-authorization|stripe-signature|x-forwarded-for|x-real-ip|x-vercel-forwarded-for|set-cookie)$/i;
const SENSITIVE_KEY = /token|secret|password|api[-_]?key|authorization|cookie|signature/i;

export type SentryTagInput = {
  route: string;
  step: string;
  fan_id?: string | null;
  code?: string | null;
  event_type?: string | null;
};

export type ScrubbableSentryEvent = {
  message?: string;
  user?: {
    id?: string;
    email?: string;
    ip_address?: string;
    username?: string;
  };
  request?: {
    url?: string;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
    headers?: Record<string, string | string[] | undefined>;
  };
  exception?: { values?: Array<{ value?: string }> };
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: Array<{ message?: string; data?: unknown; category?: string }>;
};

function readDsn(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Server runtime: private DSN, then the public one. Blank is unset. */
export function serverSentryDsn(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return readDsn(env.SENTRY_DSN) ?? readDsn(env.NEXT_PUBLIC_SENTRY_DSN);
}

/** Browser bundle can only see the public DSN. */
export function clientSentryDsn(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return readDsn(env.NEXT_PUBLIC_SENTRY_DSN);
}

export function hasSentryDsn(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(serverSentryDsn(env));
}

export function scrubPii(value: string): string {
  return value
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(PHONE_RE, "[redacted-phone]")
    .replace(SECRET_RE, "[redacted]")
    .replace(BEARER_RE, "Bearer [redacted]");
}

export function stripUrlQuery(value: string): string {
  const hash = value.indexOf("#");
  const noHash = hash === -1 ? value : value.slice(0, hash);
  const query = noHash.indexOf("?");
  return query === -1 ? noHash : noHash.slice(0, query);
}

function digestOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" ? digest : null;
}

/** Next.js uses thrown errors for redirects, notFound, and prerender bailouts. */
export function isNextControlFlowError(error: unknown, depth = 0): boolean {
  if (depth > 5 || error == null) return false;
  const digest = digestOf(error);
  if (digest) {
    for (const prefix of CONTROL_FLOW_DIGESTS) {
      if (digest === prefix || digest.startsWith(`${prefix};`)) return true;
    }
  }
  if (typeof error === "object" && error !== null && "cause" in error) {
    return isNextControlFlowError((error as { cause?: unknown }).cause, depth + 1);
  }
  return false;
}

export function reportableError(error: unknown): Error {
  if (error instanceof Error) {
    const scrubbed = new Error(scrubPii(error.message).slice(0, 500) || "Unknown error");
    scrubbed.name = (error.name || "Error").slice(0, 80);
    if (error.stack) scrubbed.stack = scrubPii(error.stack);
    return scrubbed;
  }
  if (typeof error === "string") {
    return new Error(scrubPii(error).slice(0, 500) || "Unknown error");
  }
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; code?: unknown; name?: unknown };
    const message = typeof record.message === "string" ? record.message : "Unknown error";
    const scrubbed = new Error(scrubPii(message).slice(0, 500) || "Unknown error");
    if (typeof record.name === "string" && record.name.trim()) {
      scrubbed.name = record.name.slice(0, 80);
    } else if (typeof record.code === "string" && TOKEN_RE.test(record.code)) {
      scrubbed.name = record.code;
    }
    return scrubbed;
  }
  return new Error("Unknown error");
}

function tokenTag(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !TOKEN_RE.test(trimmed)) return undefined;
  return trimmed;
}

/** Whitelisted tags. Anything else (email, phone, raw messages) is dropped. */
export function sentryTags(input: SentryTagInput): Record<string, string> {
  const tags: Record<string, string> = {
    route: ROUTE_RE.test(input.route) ? input.route : "unknown",
    step: STEP_RE.test(input.step) ? input.step : "unknown",
  };
  const fanId = input.fan_id?.trim();
  if (fanId && FAN_ID_RE.test(fanId)) tags.fan_id = fanId;
  const code = tokenTag(input.code);
  if (code) tags.code = code;
  const eventType = tokenTag(input.event_type);
  if (eventType) tags.event_type = eventType;
  return tags;
}

function scrubRecord(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    const scrubbed = scrubPii(value);
    return /url|path|query/i.test(key) ? stripUrlQuery(scrubbed) : scrubbed;
  }
  if (Array.isArray(value)) return value.map((item) => scrubRecord(item));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(childKey)) continue;
    out[childKey] = scrubRecord(child, childKey);
  }
  return out;
}

export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
  if (event.message) event.message = scrubPii(event.message);
  if (event.user) {
    const id = event.user.id?.trim();
    event.user = id && FAN_ID_RE.test(id) ? { id } : {};
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripUrlQuery(scrubPii(event.request.url));
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADER.test(key) || SENSITIVE_KEY.test(key)) {
          delete event.request.headers[key];
        } else {
          const header = event.request.headers[key];
          if (typeof header === "string") event.request.headers[key] = scrubPii(header);
          else if (Array.isArray(header)) {
            event.request.headers[key] = header.map((item) => scrubPii(item));
          }
        }
      }
    }
  }
  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (value.value) value.value = scrubPii(value.value);
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter((crumb) => crumb.category !== "console")
      .map((crumb) => ({
        ...crumb,
        message: crumb.message ? scrubPii(crumb.message) : crumb.message,
        data: undefined,
      }));
  }
  if ("extra" in event) event.extra = scrubRecord(event.extra) as T["extra"];
  if ("contexts" in event) event.contexts = scrubRecord(event.contexts) as T["contexts"];
  return event;
}
