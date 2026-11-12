import { DEFAULT_COMMUNITY_SLUG } from "./community-default.ts";
import { safeAppPath } from "./safe-app-path.ts";

/**
 * Guest signup URLs used when an unauthenticated visitor hits a signed-in
 * surface (onboarding, join-to-share). Callers should pass the resolved
 * community as `ref`; the default is DEFAULT_COMMUNITY_SLUG (the launch
 * community). Never send guests to jgos.io.
 */

export function sanitizeAppPath(raw: string | null | undefined): string | null {
  return safeAppPath(raw) ?? null;
}

export function guestSignupHref(opts: {
  ref?: string | null;
  next?: string | null;
  fallbackNext?: string;
}): string {
  const params = new URLSearchParams();
  const ref = opts.ref?.trim();
  params.set("ref", ref || DEFAULT_COMMUNITY_SLUG);
  const next =
    sanitizeAppPath(opts.next) ??
    sanitizeAppPath(opts.fallbackNext) ??
    "/onboarding";
  params.set("next", next);
  return `/signup?${params.toString()}`;
}

export function isOnboardingPath(pathname: string): boolean {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}
