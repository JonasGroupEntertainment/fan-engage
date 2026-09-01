/**
 * Production host canonicalization.
 *
 * Canonical public host is www.fanengagepro.com.
 * Live 2026-08-26: fan-engage-pearl.vercel.app and apex fanengagepro.com
 * both still 200 (next.config host rules did not fire on Vercel).
 * Middleware enforces the same 308 so pearl / apex cannot stay live origins.
 *
 * Also pin known production Vercel project aliases (fan-engage.vercel.app,
 * fanengagepro.vercel.app) the same way. If a host still 200s after deploy,
 * it is a different Vercel project — add a dashboard alias/redirect there.
 *
 * Never redirect www → apex. Never treat a preview *.vercel.app host as
 * the production alias.
 */

export const CANONICAL_PRODUCTION_HOST = "www.fanengagepro.com";
export const CANONICAL_PRODUCTION_ORIGIN = "https://www.fanengagepro.com";
export const PRODUCTION_VERCEL_ALIAS_HOST = "fan-engage-pearl.vercel.app";
export const PRODUCTION_VERCEL_PROJECT_HOST = "fan-engage.vercel.app";
export const PRODUCTION_VERCEL_NAME_HOST = "fanengagepro.vercel.app";
export const PRODUCTION_APEX_HOST = "fanengagepro.com";

export const PRODUCTION_REDIRECT_SOURCE_HOSTS = [
  PRODUCTION_VERCEL_ALIAS_HOST,
  PRODUCTION_VERCEL_PROJECT_HOST,
  PRODUCTION_VERCEL_NAME_HOST,
  PRODUCTION_APEX_HOST,
] as const;

export type ProductionRedirectSourceHost =
  (typeof PRODUCTION_REDIRECT_SOURCE_HOSTS)[number];

export type NextHostRedirect = {
  source: string;
  has: [{ type: "host"; value: string }];
  destination: string;
  permanent: true;
};

export function hostnameFromHostHeader(
  hostHeader: string | null | undefined,
): string {
  if (!hostHeader) return "";
  const first = hostHeader.split(",")[0]?.trim() ?? "";
  return first.split(":")[0]?.toLowerCase() ?? "";
}

export function requestHostname(headers: {
  get(name: string): string | null;
}): string {
  return hostnameFromHostHeader(
    headers.get("x-forwarded-host") ?? headers.get("host"),
  );
}

export function isProductionRedirectSourceHost(
  host: string,
): host is ProductionRedirectSourceHost {
  return (PRODUCTION_REDIRECT_SOURCE_HOSTS as readonly string[]).includes(host);
}

/**
 * Absolute https://www.fanengagepro.com URL for a same-path 308, or null
 * when the request is already on www / a preview / local host.
 */
export function productionHostRedirect(
  hostHeader: string | null | undefined,
  pathname: string,
  search = "",
): string | null {
  const host = hostnameFromHostHeader(hostHeader);
  if (!isProductionRedirectSourceHost(host)) return null;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const qs = !search ? "" : search.startsWith("?") ? search : `?${search}`;
  return `${CANONICAL_PRODUCTION_ORIGIN}${path}${qs}`;
}

/** next.config `redirects()` entries: known prod aliases + apex → www (308). */
export function productionHostRedirectRules(): NextHostRedirect[] {
  return PRODUCTION_REDIRECT_SOURCE_HOSTS.flatMap((host) => [
    {
      source: "/",
      has: [{ type: "host" as const, value: host }],
      destination: `${CANONICAL_PRODUCTION_ORIGIN}/`,
      permanent: true as const,
    },
    {
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: `${CANONICAL_PRODUCTION_ORIGIN}/:path*`,
      permanent: true as const,
    },
  ]);
}
