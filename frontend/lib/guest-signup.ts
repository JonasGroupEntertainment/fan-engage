/**
 * Guest signup URLs used when an unauthenticated visitor hits a signed-in
 * surface (onboarding, join-to-share). Default artist ref is raelynn —
 * existing launch convention. Never send guests to jgos.io.
 */

export function sanitizeAppPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}

export function guestSignupHref(opts: {
  ref?: string | null;
  next?: string | null;
  fallbackNext?: string;
}): string {
  const params = new URLSearchParams();
  const ref = opts.ref?.trim();
  params.set("ref", ref || "raelynn");
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
