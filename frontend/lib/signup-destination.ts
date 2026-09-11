import { safeAppPath } from "./safe-app-path.ts";

/** Preserve artist and destination when switching login -> signup -> onboarding. */
export function signupOnboardingHref(rawNext: string | null, ref: string | null): string {
  const next = safeAppPath(rawNext);
  const params = new URLSearchParams();
  if (next) {
    const url = new URL(next, "https://fan-engage.invalid");
    if (url.pathname === "/onboarding") {
      const nestedRef = url.searchParams.get("ref");
      const nestedNext = safeAppPath(url.searchParams.get("next"));
      if (nestedRef) params.set("ref", nestedRef);
      if (nestedNext && new URL(nestedNext, url.origin).pathname !== "/onboarding") {
        params.set("next", nestedNext);
      }
    } else {
      params.set("next", next);
    }
  }
  if (ref) params.set("ref", ref);
  params.sort();
  const query = params.toString();
  return query ? `/onboarding?${query}` : "/onboarding";
}
