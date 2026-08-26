/**
 * Canonical public origin for auth redirects and emails.
 *
 * Production magic links must land on https://www.fanengagepro.com.
 * The Vercel production alias (fan-engage-pearl.vercel.app) is still live
 * and must never be emitted as APP_URL / emailRedirectTo — GoTrue falls
 * back to its Site URL when the requested redirect is not allow-listed,
 * which is how pearl leaked into /verify redirect_to.
 *
 * Preview deployments may keep their *.vercel.app host. The production
 * alias is never treated as a preview host.
 */

export const CANONICAL_PRODUCTION_APP_URL = "https://www.fanengagepro.com";
export const PRODUCTION_VERCEL_ALIAS_HOST = "fan-engage-pearl.vercel.app";

export type AppUrlEnv = {
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_URL?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
};

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toOrigin(raw: string): string | null {
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function hostnameOf(origin: string): string {
  return new URL(origin).hostname.toLowerCase();
}

function vercelEnvOf(env: AppUrlEnv): string | undefined {
  return env.VERCEL_ENV || env.NEXT_PUBLIC_VERCEL_ENV;
}

function isPreviewEnv(env: AppUrlEnv): boolean {
  return vercelEnvOf(env) === "preview";
}

function isFanEngageProductionHost(host: string): boolean {
  return host === "fanengagepro.com" || host === "www.fanengagepro.com";
}

function isDisallowedProductionHost(host: string): boolean {
  return host === PRODUCTION_VERCEL_ALIAS_HOST || host.endsWith(".vercel.app");
}

export function resolveAppUrl(env: AppUrlEnv = process.env): string {
  const configured = firstNonEmpty(env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_SITE_URL);
  const vercelOrigin = env.VERCEL_URL ? toOrigin(env.VERCEL_URL) : null;

  if (isPreviewEnv(env)) {
    const candidate = (configured ? toOrigin(configured) : null) ?? vercelOrigin;
    if (candidate) {
      const host = hostnameOf(candidate);
      if (host === PRODUCTION_VERCEL_ALIAS_HOST) {
        return CANONICAL_PRODUCTION_APP_URL;
      }
      return candidate;
    }
    return CANONICAL_PRODUCTION_APP_URL;
  }

  // Production and local-without-preview: never leak VERCEL_URL / pearl.
  const candidate = configured ? toOrigin(configured) : null;
  if (candidate) {
    const host = hostnameOf(candidate);
    if (isDisallowedProductionHost(host) || isFanEngageProductionHost(host)) {
      return CANONICAL_PRODUCTION_APP_URL;
    }
    return candidate;
  }

  return CANONICAL_PRODUCTION_APP_URL;
}

export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export function authEmailRedirectTo(
  nextPath: string,
  appUrl: string = APP_URL,
): string {
  const next = sanitizeNextPath(nextPath);
  return `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`;
}

export const APP_URL = resolveAppUrl({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_URL: process.env.VERCEL_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
});
